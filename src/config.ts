import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { StoredCredential } from "./types.js";

export function odiseoConfigDir(): string {
  const explicit = process.env.ODISEO_CONFIG_DIR?.trim();
  if (explicit) return explicit;

  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  if (xdg) return join(xdg, "odiseo");

  return join(homedir(), ".config", "odiseo");
}

export function credentialPath(): string {
  return join(odiseoConfigDir(), "config.json");
}

export async function readCredential(): Promise<StoredCredential | null> {
  let raw: string;
  try {
    raw = await readFile(credentialPath(), "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Odiseo config is not valid JSON: ${credentialPath()}. Run "odiseo login" again.`,
    );
  }

  if (!isStoredCredential(parsed)) {
    throw new Error(
      `Odiseo config has an unsupported shape: ${credentialPath()}. Run "odiseo login" again.`,
    );
  }

  return parsed;
}

export async function requireCredential(): Promise<StoredCredential> {
  const credential = await readCredential();
  if (!credential) {
    throw new Error(
      'You are not logged in. Run "odiseo login" or "odiseo login --key seoap_…".',
    );
  }
  return credential;
}

export async function writeCredential(
  credential: StoredCredential,
): Promise<void> {
  await writeJsonSecure(credentialPath(), credential);
}

export async function removeCredential(): Promise<boolean> {
  try {
    await unlink(credentialPath());
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

export async function readJsonObject(
  path: string,
): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      throw new Error(`${path} must contain a JSON object.`);
    }
    return parsed;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return {};
    throw error;
  }
}

export async function writeJsonSecure(
  path: string,
  value: unknown,
): Promise<void> {
  await writeTextSecure(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeTextSecure(
  path: string,
  value: string,
): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700).catch(() => undefined);

  const tempPath = join(
    directory,
    `.${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`,
  );

  try {
    await writeFile(tempPath, value, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(tempPath, path);
    await chmod(path, 0o600);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

function isStoredCredential(value: unknown): value is StoredCredential {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    (value.authMethod === "device" || value.authMethod === "api_key") &&
    typeof value.accessToken === "string" &&
    value.accessToken.length > 0 &&
    value.tokenType === "Bearer" &&
    typeof value.baseUrl === "string" &&
    typeof value.mcpEndpoint === "string" &&
    typeof value.savedAt === "string" &&
    (value.expiresAt === undefined || typeof value.expiresAt === "string")
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
