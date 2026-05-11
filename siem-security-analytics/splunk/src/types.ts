/** Splunk HEC event envelope */
export interface SplunkHecEvent {
  time: number; // Unix epoch seconds
  host: string;
  source: string;
  sourcetype: string;
  index: string;
  event: SplunkCimAuthEvent;
}

/** CIM Authentication data model fields */
export interface SplunkCimAuthEvent {
  /** "success" | "failure" | "error" */
  action: string;
  /** Application name */
  app: string;
  /** Source IP (client) */
  src: string;
  /** Destination (Ory project URL) */
  dest: string;
  /** User email */
  user: string;
  /** Ory identity ID */
  src_user: string;
  /** "password" | "oidc" | "totp" | "webauthn" | "lookup_secret" */
  authentication_method: string;
  /** Event type signature */
  signature: string;
  /** Flow ID */
  signature_id: string;
  /** Optional failure reason */
  reason?: string;
  /** Additional context */
  [key: string]: unknown;
}

/** Splunk HEC client configuration */
export interface SplunkHecConfig {
  /** HEC endpoint URL (e.g., https://splunk.example.com:8088) */
  hecUrl: string;
  /** HEC token — MUST come from a secret manager */
  hecToken: string;
  /** Splunk index */
  index: string;
  /** Event source */
  source: string;
  /** Event sourcetype */
  sourcetype: string;
  /** Host identifier */
  host: string;
  /** Skip TLS verification (for self-signed certs in dev) */
  skipTlsVerify?: boolean;
}

/** Ory webhook payload */
export interface OryWebhookPayload {
  identity: {
    id: string;
    traits: {
      email: string;
      [key: string]: unknown;
    };
    metadata_public?: Record<string, unknown>;
  };
  flow: {
    id: string;
    type: string;
  };
  request_headers?: Record<string, string[]>;
  request_url?: string;
  request_method?: string;
}
