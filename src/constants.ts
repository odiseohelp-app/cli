export const CLI_VERSION = "0.1.0";
export const DEFAULT_BASE_URL = "https://odiseo.help";
export const DEFAULT_MCP_ENDPOINT = `${DEFAULT_BASE_URL}/api/mcp`;
export const DEVICE_CLIENT_ID = "odiseo-cli";
export const DEVICE_GRANT_TYPE =
  "urn:ietf:params:oauth:grant-type:device_code";

export type McpClient = "claude" | "cursor" | "codex" | "openclaw";

export const MCP_CLIENTS: readonly McpClient[] = [
  "claude",
  "cursor",
  "codex",
  "openclaw",
];
