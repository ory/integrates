// SPDX-License-Identifier: Apache-2.0
//
// Castle.io <> Ory Actions webhook handler.
//
// Receives post-login and post-registration events from Ory, calls Castle's
// Risk API, and translates the response into Ory's flow control: allow,
// challenge (flag identity for MFA step-up), or deny (block the flow).
//
// Castle authenticates server-to-server with HTTP Basic auth: empty username,
// API secret as password.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const CASTLE_API_SECRET = process.env.CASTLE_API_SECRET;
const CASTLE_API_BASE = process.env.CASTLE_API_BASE || "https://api.castle.io";
const CHALLENGE_THRESHOLD = parseFloat(process.env.CASTLE_CHALLENGE_THRESHOLD || "0.6");
const DENY_THRESHOLD = parseFloat(process.env.CASTLE_DENY_THRESHOLD || "0.9");

if (!ORY_WEBHOOK_SECRET || !CASTLE_API_SECRET) {
  console.error("ORY_WEBHOOK_SECRET and CASTLE_API_SECRET must be set in .env");
  process.exit(1);
}

interface OryWebhookBody {
  identity: {
    id: string;
    traits?: { email?: string };
    metadata_public?: Record<string, unknown>;
    created_at?: string;
  };
  flow: {
    id: string;
    type: string;
    transient_payload?: { castle_request_token?: string } & Record<string, unknown>;
  };
  request_headers?: Record<string, string[]>;
}

interface CastleRiskResponse {
  risk: number;
  policy: { action: "allow" | "challenge" | "deny"; id: string; name: string };
  signals?: Record<string, unknown>;
  device?: { token?: string; fingerprint?: string };
}

interface RiskAssessment {
  score: number;
  action: CastleRiskResponse["policy"]["action"];
  policy_name: string;
  assessed_at: string;
}

const app = express();
app.use(express.json());

// Length-check first, then timing-safe compare on equal-length Buffers.
function verifyWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const provided = req.header("x-webhook-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(ORY_WEBHOOK_SECRET as string);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: "invalid webhook secret" });
    return;
  }
  next();
}

const CASTLE_AUTH = `Basic ${Buffer.from(`:${CASTLE_API_SECRET}`).toString("base64")}`;

function clientIp(headers: Record<string, string[]> | undefined): string {
  const xff = headers?.["x-forwarded-for"]?.[0];
  return xff ? (xff.split(",")[0]?.trim() ?? "0.0.0.0") : "0.0.0.0";
}

function flatHeaders(
  headers: Record<string, string[]> | undefined,
): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v && v.length > 0 && v[0]) out[k] = v[0];
  }
  return out;
}

async function callCastle(
  payload: OryWebhookBody,
  eventType: "$login" | "$registration",
): Promise<CastleRiskResponse> {
  const body: Record<string, unknown> = {
    type: eventType,
    status: "$succeeded",
    user: {
      id: payload.identity.id,
      email: payload.identity.traits?.email,
      registered_at: payload.identity.created_at,
    },
    context: {
      ip: clientIp(payload.request_headers),
      headers: flatHeaders(payload.request_headers),
    },
  };
  const requestToken = payload.flow?.transient_payload?.castle_request_token;
  if (requestToken) body.request_token = requestToken;

  const res = await fetch(`${CASTLE_API_BASE}/v1/risk`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: CASTLE_AUTH },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Castle API ${res.status}: ${detail}`);
  }
  return (await res.json()) as CastleRiskResponse;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Post-login: synchronous interrupt-capable hook.
//   risk >= DENY_THRESHOLD or policy.action === "deny" -> 400 (block)
//   risk >= CHALLENGE_THRESHOLD or policy.action === "challenge" -> 200 with requires_mfa_stepup=true
//   otherwise -> 200, risk recorded in metadata_public
// Castle outage falls open: 200 with empty body so authentication continues.
app.post(
  "/castle/login",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OryWebhookBody>, res: Response) => {
    try {
      const result = await callCastle(req.body, "$login");
      const assessment: RiskAssessment = {
        score: result.risk,
        action: result.policy.action,
        policy_name: result.policy.name,
        assessed_at: new Date().toISOString(),
      };

      if (result.risk >= DENY_THRESHOLD || result.policy.action === "deny") {
        res.status(400).json({
          messages: [{
            instance_ptr: "#/",
            message: "Login blocked due to suspicious activity. Please contact support.",
            type: "error",
          }],
        });
        return;
      }

      const requires_mfa_stepup =
        result.risk >= CHALLENGE_THRESHOLD || result.policy.action === "challenge";

      res.status(200).json({
        identity: {
          metadata_public: { risk_assessment: assessment, requires_mfa_stepup },
        },
      });
    } catch (err) {
      console.error("Castle login risk assessment failed:", (err as Error).message);
      res.status(200).json({});
    }
  },
);

// Post-registration: same shape, registration-specific event type. Risk goes
// into metadata_admin so it's available to support tooling but not exposed.
app.post(
  "/castle/registration",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OryWebhookBody>, res: Response) => {
    try {
      const result = await callCastle(req.body, "$registration");
      const assessment: RiskAssessment = {
        score: result.risk,
        action: result.policy.action,
        policy_name: result.policy.name,
        assessed_at: new Date().toISOString(),
      };

      if (result.policy.action === "deny") {
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
        identity: { metadata_admin: { risk_assessment: assessment } },
      });
    } catch (err) {
      console.error("Castle registration risk assessment failed:", (err as Error).message);
      res.status(200).json({});
    }
  },
);

app.listen(PORT, () => {
  console.log(`Castle.io webhook listening on port ${PORT}`);
});
