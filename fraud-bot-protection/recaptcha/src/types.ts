/** Configuration for the reCAPTCHA webhook handler */
export interface RecaptchaConfig {
  version: "v2" | "v3";
  /** Minimum score threshold for v3 (0.0 to 1.0, default 0.5) */
  scoreThreshold: number;
  /** Expected action name for v3 validation */
  expectedAction?: string;
}

/** Google reCAPTCHA siteverify API response */
export interface RecaptchaVerifyResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  /** v3 only: score between 0.0 (bot) and 1.0 (human) */
  score?: number;
  /** v3 only: the action name from the client */
  action?: string;
  "error-codes"?: string[];
}

/** Verification result returned by verifyRecaptchaToken */
export interface VerificationResult {
  success: boolean;
  score?: number;
  action?: string;
  errorCodes?: string[];
  failureReason?: string;
}

/** Ory webhook payload */
export interface OryWebhookPayload {
  flow: {
    id: string;
    type: string;
    transient_payload?: {
      recaptcha_token?: string;
      [key: string]: unknown;
    };
  };
  identity?: {
    id: string;
    traits: {
      email?: string;
      [key: string]: unknown;
    };
  };
  request_headers?: Record<string, string[]>;
  request_url?: string;
}

/** Ory error response format to reject a flow */
export interface OryErrorResponse {
  messages: Array<{
    instance_ptr: string;
    message: string;
    type: "error" | "info";
    context?: Record<string, unknown>;
  }>;
}
