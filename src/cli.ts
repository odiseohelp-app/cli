#!/usr/bin/env node

import {
  CLI_VERSION,
  DEFAULT_BASE_URL,
  MCP_CLIENTS,
  type McpClient,
} from "./constants.js";
import { removeCredential, requireCredential } from "./config.js";
import { doctor } from "./doctor.js";
import { installMcp } from "./install.js";
import { login } from "./login.js";

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    process.stdout.write(`${CLI_VERSION}\n`);
    return;
  }

  switch (command) {
    case "login": {
      const parsed = parseOptions(rest);
      assertNoPositionals(parsed.positionals, "login");
      const baseUrl = option(parsed, "base-url");
      const apiKey = option(parsed, "key");
      await login({
        ...(baseUrl ? { baseUrl } : {}),
        ...(apiKey ? { apiKey } : {}),
        openBrowser: !parsed.flags.has("no-open"),
      });
      return;
    }

    case "logout": {
      assertNoPositionals(rest, "logout");
      const removed = await removeCredential();
      process.stdout.write(
        removed ? "Removed the Odiseo CLI credential.\n" : "No CLI credential was stored.\n",
      );
      return;
    }

    case "doctor": {
      const parsed = parseOptions(rest);
      assertNoPositionals(parsed.positionals, "doctor");
      const credential = await requireCredential();
      await doctor(credential, option(parsed, "endpoint") ?? credential.mcpEndpoint);
      return;
    }

    case "mcp": {
      await handleMcp(rest);
      return;
    }

    default:
      throw new Error(`Unknown command "${command}". Run "odiseo --help".`);
  }
}

async function handleMcp(argv: string[]): Promise<void> {
  const [subcommand, ...rest] = argv;
  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    printMcpHelp();
    return;
  }

  if (subcommand === "doctor") {
    const parsed = parseOptions(rest);
    assertNoPositionals(parsed.positionals, "mcp doctor");
    const credential = await requireCredential();
    await doctor(credential, option(parsed, "endpoint") ?? credential.mcpEndpoint);
    return;
  }

  if (subcommand === "install") {
    const parsed = parseOptions(rest);
    const rawClient = parsed.positionals[0];
    if (!rawClient || !isMcpClient(rawClient)) {
      throw new Error(
        `Choose a client: ${MCP_CLIENTS.join(", ")}. Example: "odiseo mcp install cursor".`,
      );
    }
    if (parsed.positionals.length > 1) {
      throw new Error('Too many arguments for "mcp install".');
    }

    const credential = await requireCredential();
    await installMcp({
      client: rawClient,
      endpoint: option(parsed, "endpoint") ?? credential.mcpEndpoint,
      accessToken: credential.accessToken,
    });
    process.stdout.write(
      'Run "odiseo mcp doctor" to verify the credential and endpoint.\n',
    );
    return;
  }

  throw new Error(`Unknown MCP command "${subcommand}". Run "odiseo mcp --help".`);
}

interface ParsedOptions {
  options: Map<string, string>;
  flags: Set<string>;
  positionals: string[];
}

function parseOptions(argv: string[]): ParsedOptions {
  const parsed: ParsedOptions = {
    options: new Map(),
    flags: new Set(),
    positionals: [],
  };
  const optionsWithValues = new Set(["base-url", "endpoint", "key"]);
  const booleanFlags = new Set(["no-open"]);

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value?.startsWith("--")) {
      if (value) parsed.positionals.push(value);
      continue;
    }

    const [rawName, inlineValue] = value.slice(2).split("=", 2);
    if (!rawName) throw new Error(`Invalid option "${value}".`);
    if (booleanFlags.has(rawName)) {
      parsed.flags.add(rawName);
      continue;
    }
    if (!optionsWithValues.has(rawName)) {
      throw new Error(`Unknown option "--${rawName}".`);
    }

    const optionValue = inlineValue ?? argv[index + 1];
    if (!optionValue || optionValue.startsWith("--")) {
      throw new Error(`Option "--${rawName}" requires a value.`);
    }
    parsed.options.set(rawName, optionValue);
    if (inlineValue === undefined) index += 1;
  }

  return parsed;
}

function option(parsed: ParsedOptions, name: string): string | undefined {
  return parsed.options.get(name);
}

function assertNoPositionals(values: string[], command: string): void {
  if (values.length > 0) {
    throw new Error(`Unexpected argument for "${command}": ${values[0]}`);
  }
}

function isMcpClient(value: string): value is McpClient {
  return (MCP_CLIENTS as readonly string[]).includes(value);
}

function printHelp(): void {
  process.stdout.write(`Odiseo CLI ${CLI_VERSION}

Usage:
  odiseo login [--base-url ${DEFAULT_BASE_URL}] [--no-open]
  odiseo login --key seoap_…
  odiseo logout
  odiseo mcp install <claude|cursor|codex|openclaw> [--endpoint URL]
  odiseo mcp doctor [--endpoint URL]
  odiseo doctor [--endpoint URL]

Quickstart:
  npx @odiseo/cli login
  npx @odiseo/cli mcp install cursor
  npx @odiseo/cli mcp doctor

The CLI never prints stored credentials. Client configs are written with
owner-only permissions where the client supports file-based configuration.
`);
}

function printMcpHelp(): void {
  process.stdout.write(`Usage:
  odiseo mcp install <claude|cursor|codex|openclaw> [--endpoint URL]
  odiseo mcp doctor [--endpoint URL]
`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
