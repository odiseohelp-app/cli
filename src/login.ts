import { spawn } from "node:child_process";

import {
  DEFAULT_BASE_URL,
  DEVICE_CLIENT_ID,
  DEVICE_GRANT_TYPE,
} from "./constants.js";
import { writeCredential } from "./config.js";
import { postJson } from "./http.js";
import type {
  DeviceCodeResponse,
  DeviceTokenResponse,
  OAuthErrorResponse,
  StoredCredential,
} from "./types.js";

export interface LoginOptions {
  baseUrl?: string;
  apiKey?: string;
  openBrowser?: boolean;
}

export async function login(options: LoginOptions = {}): Promise<void> {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const mcpEndpoint = `${baseUrl}/api/mcp`;

  if (options.apiKey !== undefined) {
    await loginWithApiKey(options.apiKey, baseUrl, mcpEndpoint);
    return;
  }

  const codeResponse = await postJson<
    DeviceCodeResponse | OAuthErrorResponse
  >(`${baseUrl}/api/auth/device/code`, {
    client_id: DEVICE_CLIENT_ID,
    scope: "openid profile email offline_access",
  });

  if (!codeResponse.ok || !isDeviceCodeResponse(codeResponse.data)) {
    throw new Error(
      oauthErrorMessage(codeResponse.data, "Could not start device login."),
    );
  }

  const code = codeResponse.data;
  const verificationUrl =
    code.verification_uri_complete ?? code.verification_uri;

  process.stdout.write(
    [
      "",
      "Authorize this device in Odiseo",
      "",
      `  Code: ${code.user_code}`,
      `  URL:  ${verificationUrl}`,
      "",
      "Waiting for approval…",
      "",
    ].join("\n"),
  );

  if (options.openBrowser !== false) {
    openBrowser(verificationUrl);
  }

  const token = await pollForDeviceToken(
    `${baseUrl}/api/auth/device/token`,
    code,
  );
  const now = new Date();
  const credential: StoredCredential = {
    version: 1,
    authMethod: "device",
    accessToken: token.access_token,
    tokenType: "Bearer",
    baseUrl,
    mcpEndpoint,
    savedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + token.expires_in * 1000).toISOString(),
  };
  await writeCredential(credential);
  process.stdout.write("Logged in. The credential was stored with owner-only permissions.\n");
}

async function loginWithApiKey(
  apiKey: string,
  baseUrl: string,
  mcpEndpoint: string,
): Promise<void> {
  const normalized = apiKey.trim();
  if (!/^seoap_[A-Za-z0-9_-]{16,}$/.test(normalized)) {
    throw new Error('The API key must start with "seoap_" and be complete.');
  }

  await writeCredential({
    version: 1,
    authMethod: "api_key",
    accessToken: normalized,
    tokenType: "Bearer",
    baseUrl,
    mcpEndpoint,
    savedAt: new Date().toISOString(),
  });
  process.stdout.write("API key stored with owner-only permissions.\n");
}

async function pollForDeviceToken(
  tokenUrl: string,
  code: DeviceCodeResponse,
): Promise<DeviceTokenResponse> {
  const deadline = Date.now() + code.expires_in * 1000;
  let intervalMs = Math.max(code.interval, 1) * 1000;

  while (Date.now() < deadline) {
    await wait(intervalMs);
    const response = await postJson<DeviceTokenResponse | OAuthErrorResponse>(
      tokenUrl,
      {
        grant_type: DEVICE_GRANT_TYPE,
        device_code: code.device_code,
        client_id: DEVICE_CLIENT_ID,
      },
    );

    if (response.ok && isDeviceTokenResponse(response.data)) {
      return response.data;
    }

    const error =
      "error" in response.data && typeof response.data.error === "string"
        ? response.data.error
        : "server_error";
    if (error === "authorization_pending") continue;
    if (error === "slow_down") {
      intervalMs += 5_000;
      continue;
    }
    throw new Error(oauthErrorMessage(response.data, "Device login failed."));
  }

  throw new Error('The device code expired. Run "odiseo login" again.');
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? { file: "open", args: [url] }
      : process.platform === "win32"
        ? { file: "cmd", args: ["/c", "start", "", url] }
        : { file: "xdg-open", args: [url] };

  const child = spawn(command.file, command.args, {
    detached: true,
    stdio: "ignore",
  });
  child.on("error", () => undefined);
  child.unref();
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("Odiseo base URL must use HTTPS (except localhost).");
  }
  return url.toString().replace(/\/$/, "");
}

function isDeviceCodeResponse(
  value: DeviceCodeResponse | OAuthErrorResponse,
): value is DeviceCodeResponse {
  return (
    "device_code" in value &&
    typeof value.device_code === "string" &&
    typeof value.user_code === "string" &&
    typeof value.verification_uri === "string"
  );
}

function isDeviceTokenResponse(
  value: DeviceTokenResponse | OAuthErrorResponse,
): value is DeviceTokenResponse {
  return (
    "access_token" in value &&
    typeof value.access_token === "string" &&
    typeof value.expires_in === "number"
  );
}

function oauthErrorMessage(
  value: DeviceCodeResponse | DeviceTokenResponse | OAuthErrorResponse,
  fallback: string,
): string {
  if ("error_description" in value && value.error_description) {
    return value.error_description;
  }
  if ("error" in value && value.error) return `${fallback} (${value.error})`;
  return fallback;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
