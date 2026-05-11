/**
 * Castle.io <> Ory Actions Webhook Handler
 *
 * Adaptive risk scoring for login and registration flows.
 * Castle evaluates device fingerprints, IP reputation, and behavioral signals
 * to return a risk score and recommended action (allow/challenge/deny).
 *
 * Flow:
 *   1. Client-side Castle.js SDK collects device context → request_token
 *   2. Client passes request_token via Ory's transient_payload
 *   3. This handler sends the event to Castle's Risk API
 *   4. Based on the response:
 *      - allow: proceed normally
 *      - challenge: flag for MFA step-up (stored in metadata_public)
 *      - deny: reject the flow with a 400 error
 *
 * SECURITY: Store CASTLE_API_SECRET in a secret manager.
 *   - Use a secret manager (Cloud Secret Manager, AWS Secrets Manager, Vault, etc.)
 */

import express from "express";
import type {
  OryWebhookPayload,
  CastleRiskRequest,
  CastleRiskResponse,
  RiskAssessment,
} from "./types";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3006", 10);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const CASTLE_API_URL = "https://api.castle.io/v1/risk";

// Risk thresholds — configurable via env vars
const CHALLENGE_THRESHOLD = parseFloat(process.env.CASTLE_CHALLENGE_THRESHOLD || "0.6");
const DENY_THRESHOLD = parseFloat(process.env.CASTLE_DENY_THRESHOLD || "0.9");

// --- Middleware ---

function authenticateWebhook(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (!WEBHOOK_SECRET) { next(); return; }
  if (req.get("X-Webhook-Secret") !== WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// --- Helpers ---

function extractHeaders(
  oryHeaders?: Record<string, string[]>,
): Record<string, string> {
  if (!oryHeaders) return {};
  const result: Record<string, string> = {};
  for (const [key, values] of Object.entries(oryHeaders)) {
    if (values && values.length > 0) {
      result[key] = values[0];
    }
  }
  return result;
}

function extractClientIp(headers?: Record<string, string[]>): string {
  if (!headers) return "0.0.0.0";
  return headers["x-forwarded-for"]?.[0]?.split(",")[0]?.trim() || "0.0.0.0";
}

async function assessRisk(
  payload: OryWebhookPayload,
  eventType: "$login" | "$registration",
): Promise<CastleRiskResponse> {
  // IMPORTANT: Store CASTLE_API_SECRET in a secret manager.
  const apiSecret = process.env.CASTLE_API_SECRET;
  if (!apiSecret) {
    throw new Error("CASTLE_API_SECRET not set. Store it in a secret manager.");
  }

  const request: CastleRiskRequest = {
    type: eventType,
    status: "$succeeded",
    user: {
      id: payload.identity.id,
      email: payload.identity.traits.email,
      registered_at: payload.identity.created_at,
    },
    context: {
      ip: extractClientIp(payload.request_headers),
      headers: extractHeaders(payload.request_headers),
    },
  };

  // Include Castle request token from client-side SDK if available
  const requestToken = payload.flow.transient_payload?.castle_request_token;
  if (requestToken) {
    (request as any).request_token = requestToken;
  }

  const authHeader = `Basic ${Buffer.from(`:${apiSecret}`).toString("base64")}`;

  const res = await fetch(CASTLE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Castle API error: ${res.status} - ${text}`);
  }

  return (await res.json()) as CastleRiskResponse;
}

// --- Routes ---

/**
 * POST /webhooks/castle/login
 *
 * Post-login hook. Assesses login risk and either:
 *   - Allows (score < challenge threshold): sets risk in metadata
 *   - Challenges (score >= challenge, < deny): flags for MFA step-up
 *   - Denies (score >= deny threshold): blocks the login with 400
 */
app.post(
  "/webhooks/castle/login",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    const payload = req.body as OryWebhookPayload;

    try {
      const riskResult = await assessRisk(payload, "$login");

      const assessment: RiskAssessment = {
        score: riskResult.risk,
        action: riskResult.policy.action,
        policy_name: riskResult.policy.name,
        assessed_at: new Date().toISOString(),
      };

      console.log(
        `Castle: ${payload.identity.id} risk=${riskResult.risk} action=${riskResult.policy.action}`,
      );

      // Deny: block the login
      if (riskResult.risk >= DENY_THRESHOLD || riskResult.policy.action === "deny") {
        res.status(400).json({
          messages: [{
            instance_ptr: "#/",
            message: "Login blocked due to suspicious activity. Please contact support.",
            type: "error",
          }],
        });
        return;
      }

      // Challenge: allow login but flag for MFA step-up
      if (riskResult.risk >= CHALLENGE_THRESHOLD || riskResult.policy.action === "challenge") {
        res.status(200).json({
          identity: {
            metadata_public: {
              risk_assessment: assessment,
              requires_mfa_stepup: true,
            },
          },
        });
        return;
      }

      // Allow: proceed with risk score in metadata
      res.status(200).json({
        identity: {
          metadata_public: {
            risk_assessment: assessment,
            requires_mfa_stepup: false,
          },
        },
      });
    } catch (err) {
      console.error("Castle risk assessment failed:", (err as Error).message);
      // Fail open — don't block login if Castle is down
      res.status(200).json({});
    }
  },
);

/**
 * POST /webhooks/castle/registration
 * Same pattern for registration — typically more lenient thresholds.
 */
app.post(
  "/webhooks/castle/registration",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    const payload = req.body as OryWebhookPayload;

    try {
      const riskResult = await assessRisk(payload, "$registration");

      const assessment: RiskAssessment = {
        score: riskResult.risk,
        action: riskResult.policy.action,
        policy_name: riskResult.policy.name,
        assessed_at: new Date().toISOString(),
      };

      if (riskResult.policy.action === "deny") {
        res.status(400).json({
          messages: [{
            instance_ptr: "#/",
            message: "Registration blocked. Please try again or contact support.",
            type: "error",
          }],
        });
        return;
      }

      res.status(200).json({
        identity: {
          metadata_admin: { risk_assessment: assessment },
        },
      });
    } catch (err) {
      console.error("Castle risk assessment failed:", (err as Error).message);
      res.status(200).json({});
    }
  },
);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", integration: "castle" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Castle.io webhook handler listening on port ${PORT}`);
  });
}

export { app };
