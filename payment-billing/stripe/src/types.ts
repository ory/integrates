/**
 * Types for the Stripe <> Ory integration webhook handler.
 */

/** Ory identity traits — adjust to match your identity schema */
export interface OryIdentityTraits {
  email: string;
  name?: {
    first?: string;
    last?: string;
  };
  [key: string]: unknown;
}

/** Ory identity as received in webhook payload */
export interface OryIdentity {
  id: string;
  traits: OryIdentityTraits;
  metadata_public?: Record<string, unknown>;
  metadata_admin?: Record<string, unknown>;
  created_at?: string;
}

/** Ory flow context */
export interface OryFlow {
  id: string;
  type: string;
}

/** Webhook payload from Ory Actions */
export interface OryWebhookPayload {
  identity: OryIdentity;
  flow: OryFlow;
}

/** Billing info stored in identity.metadata_public */
export interface BillingInfo {
  customer_id: string;
  status: "free" | "active" | "canceled" | "past_due" | "trialing" | "unpaid";
  plan: string;
  current_period_end?: string;
}

/** Response back to Ory — sets identity metadata */
export interface RegistrationResponse {
  identity: {
    metadata_admin: {
      stripe_customer_id: string;
    };
    metadata_public: {
      billing: BillingInfo;
    };
  };
}

/** Response back to Ory on login — updates billing status */
export interface LoginResponse {
  identity: {
    metadata_public: {
      billing: BillingInfo;
    };
  };
}
