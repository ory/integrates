/** Castle.io Risk API request */
export interface CastleRiskRequest {
  type: "$login" | "$registration" | "$profile_update";
  status: "$succeeded" | "$failed";
  user: {
    id: string;
    email: string;
    registered_at?: string;
  };
  context: {
    ip: string;
    headers: Record<string, string>;
  };
  properties?: Record<string, unknown>;
}

/** Castle.io Risk API response */
export interface CastleRiskResponse {
  risk: number; // 0.0 to 1.0
  policy: {
    action: "allow" | "challenge" | "deny";
    id: string;
    name: string;
    revision_id: string;
  };
  signals: Record<string, unknown>;
  device?: {
    token: string;
    fingerprint?: string;
  };
}

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
    created_at?: string;
  };
  flow: {
    id: string;
    type: string;
    transient_payload?: {
      castle_request_token?: string;
      [key: string]: unknown;
    };
  };
  request_headers?: Record<string, string[]>;
  request_url?: string;
}

/** Risk assessment result stored in identity metadata */
export interface RiskAssessment {
  score: number;
  action: "allow" | "challenge" | "deny";
  policy_name: string;
  assessed_at: string;
}
