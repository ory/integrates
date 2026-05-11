/** Ory identity event types published to Svix */
export type OryEventType =
  | "user.registered"
  | "user.logged_in"
  | "user.settings_updated"
  | "user.recovery_initiated"
  | "user.verified";

/** Ory webhook payload */
export interface OryWebhookPayload {
  identity: {
    id: string;
    traits: {
      email: string;
      name?: { first?: string; last?: string };
      [key: string]: unknown;
    };
    metadata_public?: Record<string, unknown>;
    metadata_admin?: Record<string, unknown>;
  };
  flow: {
    id: string;
    type: string;
  };
  request_headers?: Record<string, string[]>;
  request_url?: string;
}

/** Svix event payload published to consumer endpoints */
export interface SvixEventPayload {
  /** Ory identity ID */
  userId: string;
  /** User email */
  email: string;
  /** User name */
  name?: string;
  /** Ory flow ID */
  flowId: string;
  /** Authentication method */
  method: string;
  /** Event timestamp */
  timestamp: string;
  /** Client IP */
  sourceIp?: string;
  /** Public metadata */
  metadata?: Record<string, unknown>;
}
