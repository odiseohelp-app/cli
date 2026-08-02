export interface StoredCredential {
  version: 1;
  authMethod: "device" | "api_key";
  accessToken: string;
  tokenType: "Bearer";
  baseUrl: string;
  mcpEndpoint: string;
  savedAt: string;
  expiresAt?: string;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

export interface DeviceTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface OAuthErrorResponse {
  error: string;
  error_description?: string;
}

export interface McpInitializeResult {
  protocolVersion?: string;
  serverInfo?: {
    name?: string;
    version?: string;
  };
  capabilities?: Record<string, unknown>;
}
