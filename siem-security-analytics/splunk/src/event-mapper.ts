/**
 * Maps Ory webhook payloads to Splunk CIM Authentication events.
 */

import type { OryWebhookPayload } from "./types";

/** Extract client IP from Ory webhook headers */
export function extractClientIp(
  headers?: Record<string, string[]>,
): string {
  if (!headers) return "unknown";
  const xff = headers["x-forwarded-for"]?.[0];
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

/** Determine auth method from flow context */
export function determineAuthMethod(payload: OryWebhookPayload): string {
  // The flow type indicates the method. In practice, you'd inspect the
  // method-specific data in the webhook payload.
  const flowType = payload.flow.type;
  if (flowType === "oidc") return "oidc";
  if (flowType === "totp") return "totp";
  if (flowType === "webauthn") return "webauthn";
  if (flowType === "lookup_secret") return "lookup_secret";
  return "password";
}

/** Map a registration event */
export function mapRegistrationEvent(payload: OryWebhookPayload) {
  return {
    action: "success" as const,
    authMethod: determineAuthMethod(payload),
    userId: payload.identity.id,
    userEmail: payload.identity.traits.email || "unknown",
    sourceIp: extractClientIp(payload.request_headers),
    eventType: "registration.success",
    additionalFields: {
      flow_id: payload.flow.id,
      registration_method: payload.flow.type,
    },
  };
}

/** Map a login event */
export function mapLoginEvent(payload: OryWebhookPayload) {
  return {
    action: "success" as const,
    authMethod: determineAuthMethod(payload),
    userId: payload.identity.id,
    userEmail: payload.identity.traits.email || "unknown",
    sourceIp: extractClientIp(payload.request_headers),
    eventType: "login.success",
    additionalFields: {
      flow_id: payload.flow.id,
    },
  };
}

/** Map a recovery event */
export function mapRecoveryEvent(payload: OryWebhookPayload) {
  return {
    action: "success" as const,
    authMethod: "recovery_code",
    userId: payload.identity.id,
    userEmail: payload.identity.traits.email || "unknown",
    sourceIp: extractClientIp(payload.request_headers),
    eventType: "recovery.initiated",
    additionalFields: {
      flow_id: payload.flow.id,
    },
  };
}

/** Map a settings event */
export function mapSettingsEvent(payload: OryWebhookPayload) {
  return {
    action: "success" as const,
    authMethod: determineAuthMethod(payload),
    userId: payload.identity.id,
    userEmail: payload.identity.traits.email || "unknown",
    sourceIp: extractClientIp(payload.request_headers),
    eventType: "settings.updated",
    additionalFields: {
      flow_id: payload.flow.id,
      settings_method: payload.flow.type,
    },
  };
}
