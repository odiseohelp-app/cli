import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { McpClient } from "./constants.js";
import {
  readJsonObject,
  writeJsonSecure,
  writeTextSecure,
} from "./config.js";

export interface InstallOptions {
  client: McpClient;
  endpoint: string;
  accessToken: string;
}

export async function installMcp(options: InstallOptions): Promise<void> {
  const endpoint = normalizeEndpoint(options.endpoint);
  const authorization = `Bearer ${options.accessToken}`;

  switch (options.client) {
    case "cursor": {
      const path = cursorConfigPath();
      const existing = await readJsonObject(path);
      const mcpServers = asObject(existing.mcpServers);
      existing.mcpServers = {
        ...mcpServers,
        odiseo: {
          url: endpoint,
          headers: { Authorization: authorization },
        },
      };
      await writeJsonSecure(path, existing);
      process.stdout.write(`Installed Odiseo in Cursor: ${path}\n`);
      return;
    }

    case "codex": {
      const path = codexConfigPath();
      let existing = "";
      try {
        existing = await readFile(path, "utf8");
      } catch (error) {
        if (!isNodeError(error) || error.code !== "ENOENT") throw error;
      }
      await writeTextSecure(
        path,
        upsertCodexMcpConfig(existing, endpoint, authorization),
      );
      process.stdout.write(`Installed Odiseo in Codex: ${path}\n`);
      return;
    }

    case "claude": {
      await runIgnoringFailure("claude", [
        "mcp",
        "remove",
        "odiseo",
        "--scope",
        "user",
      ]);
      await run("claude", [
        "mcp",
        "add",
        "--transport",
        "http",
        "--scope",
        "user",
        "odiseo",
        endpoint,
        "--header",
        `Authorization: ${authorization}`,
      ]);
      process.stdout.write("Installed Odiseo in Claude Code (user scope).\n");
      return;
    }

    case "openclaw": {
      await run("openclaw", [
        "mcp",
        "set",
        "odiseo",
        JSON.stringify({
          url: endpoint,
          transport: "streamable-http",
          headers: { Authorization: authorization },
        }),
      ]);
      process.stdout.write("Installed Odiseo in OpenClaw.\n");
      return;
    }
  }
}

export function cursorConfigPath(): string {
  const override = process.env.ODISEO_CURSOR_CONFIG?.trim();
  if (override) return override;
  return join(homedir(), ".cursor", "mcp.json");
}

export function codexConfigPath(): string {
  const override = process.env.ODISEO_CODEX_CONFIG?.trim();
  if (override) return override;
  const codexHome = process.env.CODEX_HOME?.trim();
  return join(codexHome || join(homedir(), ".codex"), "config.toml");
}

export function upsertCodexMcpConfig(
  source: string,
  endpoint: string,
  authorization: string,
): string {
  const output: string[] = [];
  let skipSection = false;

  for (const line of source.split(/\r?\n/)) {
    const table = line.match(/^\s*\[\[?([^\]]+)\]\]?\s*(?:#.*)?$/);
    if (table) {
      skipSection = isOdiseoTable(table[1]?.trim() ?? "");
    }
    if (!skipSection) output.push(line);
  }

  const preserved = output.join("\n").trimEnd();
  const block = [
    "[mcp_servers.odiseo]",
    `url = ${tomlString(endpoint)}`,
    `http_headers = { Authorization = ${tomlString(authorization)} }`,
    "",
  ].join("\n");

  return preserved ? `${preserved}\n\n${block}` : block;
}

function isOdiseoTable(table: string): boolean {
  return (
    table === "mcp_servers.odiseo" ||
    table.startsWith("mcp_servers.odiseo.")
  );
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function normalizeEndpoint(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("The MCP endpoint must use HTTPS (except localhost).");
  }
  return url.toString();
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function run(file: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(file, args, { stdio: "inherit", shell: false });
    child.on("error", (error) => {
      if (isNodeError(error) && error.code === "ENOENT") {
        reject(
          new Error(
            `${file} is not installed or is not on PATH. Install ${file}, then rerun the command.`,
          ),
        );
        return;
      }
      reject(error);
    });
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${file} exited with ${signal ? `signal ${signal}` : `code ${code ?? "unknown"}`}.`,
        ),
      );
    });
  });
}

async function runIgnoringFailure(file: string, args: string[]): Promise<void> {
  try {
    await new Promise<void>((resolve) => {
      const child = spawn(file, args, { stdio: "ignore", shell: false });
      child.on("error", () => resolve());
      child.on("exit", () => resolve());
    });
  } catch {
    // A missing prior entry is the expected first-install state.
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
