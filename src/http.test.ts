import assert from "node:assert/strict";
import test from "node:test";

import { parseMcpPayload } from "./http.js";

test("parses JSON and SSE MCP responses", () => {
  assert.deepEqual(
    parseMcpPayload('{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18"}}'),
    {
      jsonrpc: "2.0",
      id: 1,
      result: { protocolVersion: "2025-06-18" },
    },
  );

  assert.deepEqual(
    parseMcpPayload(
      'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"Odiseo"}}}\n\n',
    ),
    {
      jsonrpc: "2.0",
      id: 1,
      result: { serverInfo: { name: "Odiseo" } },
    },
  );
});
