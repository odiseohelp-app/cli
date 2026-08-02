import { CLI_VERSION } from "./constants.js";
import { isRecord } from "./config.js";
import type { McpInitializeResult } from "./types.js";

export interface JsonResponse<T> {
  ok: boolean;
  status: number;
  data: T;
  headers: Headers;
}

export async function postJson<T>(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<JsonResponse<T>> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let data: unknown = {};
  if (raw.trim()) {
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `Odiseo returned a non-JSON response (${response.status}) from ${url}.`,
      );
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data: data as T,
    headers: response.headers,
  };
}

export async function initializeMcp(
  endpoint: string,
  accessToken: string,
): Promise<McpInitializeResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: {
          name: "odiseo-cli",
          version: CLI_VERSION,
        },
      },
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(formatMcpHttpError(response.status, raw));
  }

  const payload = parseMcpPayload(raw);
  if (!isRecord(payload)) {
    throw new Error("Odiseo returned an invalid MCP initialize response.");
  }
  if (isRecord(payload.error)) {
    const message =
      typeof payload.error.message === "string"
        ? payload.error.message
        : "Unknown MCP error";
    throw new Error(`MCP initialize failed: ${message}`);
  }
  if (!isRecord(payload.result)) {
    throw new Error("Odiseo did not return an MCP initialize result.");
  }

  return payload.result as McpInitializeResult;
}

export function parseMcpPayload(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Odiseo returned an empty MCP response.");

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }

  const dataLines = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  for (const data of dataLines) {
    try {
      const parsed: unknown = JSON.parse(data);
      if (
        isRecord(parsed) &&
        (parsed.id === 1 || parsed.result !== undefined || parsed.error !== undefined)
      ) {
        return parsed;
      }
    } catch {
      // Ignore keep-alive or non-JSON SSE events.
    }
  }

  throw new Error("Odiseo returned an unreadable MCP response.");
}

function formatMcpHttpError(status: number, raw: string): string {
  let detail = raw.trim();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed)) {
      const candidate = parsed.message ?? parsed.error_description ?? parsed.error;
      if (typeof candidate === "string") detail = candidate;
    }
  } catch {
    // Preserve the plain response body when it is useful.
  }

  const suffix = detail ? `: ${detail.slice(0, 240)}` : "";
  if (status === 401) {
    return `Odiseo rejected the credential (401). Run "odiseo login" again${suffix}`;
  }
  if (status === 402) {
    return `Your Odiseo organization does not have MCP access (402)${suffix}`;
  }
  return `MCP initialize returned HTTP ${status}${suffix}`;
}
