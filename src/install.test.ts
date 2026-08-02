import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readCredential, writeCredential } from "./config.js";
import {
  installMcp,
  upsertCodexMcpConfig,
} from "./install.js";

test("stores credentials and client configs without exposing the token", async () => {
  const directory = await mkdtemp(join(tmpdir(), "odiseo-cli-"));
  const credentialPath = join(directory, "odiseo", "config.json");
  const cursorPath = join(directory, "cursor", "mcp.json");
  process.env.ODISEO_CONFIG_DIR = join(directory, "odiseo");
  process.env.ODISEO_CURSOR_CONFIG = cursorPath;

  await writeCredential({
    version: 1,
    authMethod: "device",
    accessToken: "session_secret",
    tokenType: "Bearer",
    baseUrl: "https://odiseo.help",
    mcpEndpoint: "https://odiseo.help/api/mcp",
    savedAt: "2026-08-03T00:00:00.000Z",
    expiresAt: "2099-08-03T00:00:00.000Z",
  });
  assert.equal((await readCredential())?.accessToken, "session_secret");

  await installMcp({
    client: "cursor",
    endpoint: "https://odiseo.help/api/mcp",
    accessToken: "session_secret",
  });

  const cursor = JSON.parse(await readFile(cursorPath, "utf8")) as {
    mcpServers: {
      odiseo: {
        url: string;
        headers: { Authorization: string };
      };
    };
  };
  assert.equal(cursor.mcpServers.odiseo.url, "https://odiseo.help/api/mcp");
  assert.equal(
    cursor.mcpServers.odiseo.headers.Authorization,
    "Bearer session_secret",
  );

  if (process.platform !== "win32") {
    assert.equal((await stat(credentialPath)).mode & 0o777, 0o600);
    assert.equal((await stat(cursorPath)).mode & 0o777, 0o600);
  }
});

test("replaces only the Odiseo Codex MCP section", () => {
  const original = `[projects."/work"]
trusted = true

[mcp_servers.other]
url = "https://example.com/mcp"

[mcp_servers.odiseo]
url = "https://old.example/mcp"
http_headers = { Authorization = "Bearer old" }

[mcp_servers.odiseo.tools.publish]
approval_mode = "prompt"

[features]
web_search = true
`;

  const updated = upsertCodexMcpConfig(
    original,
    "https://odiseo.help/api/mcp",
    "Bearer new_secret",
  );

  assert.match(updated, /\[mcp_servers\.other\]/);
  assert.match(updated, /\[features\]/);
  assert.doesNotMatch(updated, /old\.example|Bearer old|tools\.publish/);
  assert.match(updated, /url = "https:\/\/odiseo\.help\/api\/mcp"/);
  assert.match(updated, /Authorization = "Bearer new_secret"/);
});
