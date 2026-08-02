import { initializeMcp } from "./http.js";
import type { StoredCredential } from "./types.js";

export async function doctor(
  credential: StoredCredential,
  endpoint = credential.mcpEndpoint,
): Promise<void> {
  process.stdout.write(`Checking ${endpoint}…\n`);

  if (
    credential.expiresAt &&
    new Date(credential.expiresAt).getTime() <= Date.now()
  ) {
    throw new Error('The stored session has expired. Run "odiseo login" again.');
  }

  const startedAt = Date.now();
  const result = await initializeMcp(endpoint, credential.accessToken);
  const elapsed = Date.now() - startedAt;
  const name = result.serverInfo?.name ?? "Odiseo MCP";
  const version = result.serverInfo?.version
    ? ` ${result.serverInfo.version}`
    : "";
  const protocol = result.protocolVersion
    ? `, protocol ${result.protocolVersion}`
    : "";

  process.stdout.write(`OK — ${name}${version}${protocol} (${elapsed} ms)\n`);
}
