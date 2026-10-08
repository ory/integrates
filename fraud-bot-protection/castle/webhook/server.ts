// SPDX-License-Identifier: Apache-2.0
//
// Castle.io <> Ory Actions webhook handler.
//
// Receives post-login and post-registration events from Ory and calls Castle's
// Risk API. At login, the handler allows the sign-in, requires a second factor
// (challenge), or blocks it (deny). Registration events are reported after the
// identity is saved; a deny there can deactivate the identity through the Ory
// Admin API when ORY_SDK_URL and ORY_ADMIN_API_KEY are set.
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
const ORY_SDK_URL = process.env.ORY_SDK_URL;
const ORY_ADMIN_API_KEY = process.env.ORY_ADMIN_API_KEY;

if (!ORY_WEBHOOK_SECRET || !CASTLE_API_SECRET) {
  console.error("ORY_WEBHOOK_SECRET and CASTLE_API_SECRET must be set in .env");
  process.exit(1);
}

interface OryWebhookBody {
  request_token?: string | null;
  user: { id: string; email?: string | null; registered_at?: string | null };
  ip?: string | null;
  headers?: Record<string, string[]>;
}

interface CastleRiskResponse {
  risk: number;
  policy: { action: "allow" | "challenge" | "deny"; id: string; name: string };
  signals?: Record<string, unknown>;
  device?: { token?: string; fingerprint?: string };
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
      id: payload.user.id,
      ...(payload.user.email && { email: payload.user.email }),
      ...(payload.user.registered_at && { registered_at: payload.user.registered_at }),
    },
    context: {
      ip: payload.ip,
      headers: flatHeaders(payload.headers),
    },
  };
  if (payload.request_token) body.request_token = payload.request_token;

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

// Ory Kratos Identities rejects the flow and shows `text` to the user only for
// a 4xx response in this shape.
function rejectFlow(res: Response, id: number, text: string) {
  res.status(403).json({
    messages: [{ instance_ptr: "#/", messages: [{ id, text, type: "error" }] }],
  });
}

async function deactivateIdentity(identityId: string): Promise<void> {
  if (!ORY_SDK_URL || !ORY_ADMIN_API_KEY) {
    console.log(`Castle denied registration ${identityId}: ORY_SDK_URL / ORY_ADMIN_API_KEY unset, not deactivating`);
    return;
  }
  const res = await fetch(`${ORY_SDK_URL}/admin/identities/${identityId}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${ORY_ADMIN_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify([{ op: "replace", path: "/state", value: "inactive" }]),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ory patch ${res.status}: ${detail}`);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Login, configured with response.parse: true:
//   risk >= DENY_THRESHOLD or policy.action === "deny" -> 403 with a message (block)
//   risk >= CHALLENGE_THRESHOLD or policy.action === "challenge" -> 200 with
//     required_aal: aal2, which requires the webhook_response_directives feature
//     flag and is ignored without it
//   otherwise -> 200
// Ory doesn't save identity changes returned at login, so the handler returns
// no metadata. A Castle outage falls open so authentication continues.
app.post(
  "/castle/login",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OryWebhookBody>, res: Response) => {
    try {
      const result = await callCastle(req.body, "$login");
      console.log(
        `Castle login: user=${req.body.user.id} risk=${result.risk} action=${result.policy.action}`,
      );

      if (result.risk >= DENY_THRESHOLD || result.policy.action === "deny") {
        rejectFlow(res, 9000401, "Sign-in blocked. Please contact support.");
        return;
      }

      if (result.risk >= CHALLENGE_THRESHOLD || result.policy.action === "challenge") {
        res.status(200).json({ required_aal: "aal2" });
        return;
      }

      res.status(200).json({});
    } catch (err) {
      console.error("Castle login risk assessment failed:", (err as Error).message);
      res.status(200).json({});
    }
  },
);

// Registration, configured with response.ignore: true so it runs after the
// identity is saved and receives its real ID. Ory doesn't read this response.
app.post(
  "/castle/registration",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OryWebhookBody>, res: Response) => {
    try {
      const result = await callCastle(req.body, "$registration");
      console.log(
        `Castle registration: user=${req.body.user.id} risk=${result.risk} action=${result.policy.action}`,
      );
      if (result.policy.action === "deny") {
        await deactivateIdentity(req.body.user.id);
      }
      res.status(200).json({});
    } catch (err) {
      console.error("Castle registration risk assessment failed:", (err as Error).message);
      res.status(200).json({});
    }
  },
);

app.listen(PORT, () => {
  console.log(`Castle.io webhook listening on port ${PORT}`);
});
