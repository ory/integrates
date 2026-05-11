// SPDX-License-Identifier: Apache-2.0
//
// Zendesk <> Ory Actions webhook handler.
//
// Two surfaces in one process:
//
//   1. User sync — Ory async webhooks on registration and settings flows
//      call this handler; the handler creates or updates the corresponding
//      Zendesk user via Zendesk's Users API. Authenticated by the shared
//      ORY_WEBHOOK_SECRET in the X-Webhook-Secret header.
//
//   2. Sidebar identity lookup — a Zendesk app sidebar calls
//      GET /zendesk/sidebar/identity?email=... to fetch Ory identity
//      context (state, MFA, sessions, metadata) for the requester of an
//      open ticket. Authenticated by the separate ZENDESK_SIDEBAR_SECRET
//      in the X-Zendesk-Secret header so a leaked Ory webhook secret can't
//      be used to query identities, and vice versa.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const ZENDESK_SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN;
const ZENDESK_EMAIL = process.env.ZENDESK_EMAIL;
const ZENDESK_API_TOKEN = process.env.ZENDESK_API_TOKEN;
const ORY_SDK_URL = process.env.ORY_SDK_URL;
const ORY_ADMIN_API_KEY = process.env.ORY_ADMIN_API_KEY;
const ZENDESK_SIDEBAR_SECRET = process.env.ZENDESK_SIDEBAR_SECRET;

if (
  !ORY_WEBHOOK_SECRET ||
  !ZENDESK_SUBDOMAIN ||
  !ZENDESK_EMAIL ||
  !ZENDESK_API_TOKEN ||
  !ORY_SDK_URL ||
  !ORY_ADMIN_API_KEY ||
  !ZENDESK_SIDEBAR_SECRET
) {
  console.error(
    "Missing required env vars. See .env.example for the full list (ORY_WEBHOOK_SECRET, ZENDESK_*, ORY_SDK_URL, ORY_ADMIN_API_KEY, ZENDESK_SIDEBAR_SECRET).",
  );
  process.exit(1);
}

interface OryIdentity {
  id: string;
  state?: string;
  traits?: {
    email?: string;
    name?: { first?: string; last?: string };
  };
  metadata_public?: {
    billing?: { plan?: string; status?: string };
    risk_assessment?: { score?: number };
    [key: string]: unknown;
  };
  credentials?: {
    totp?: { identifiers?: string[] };
    webauthn?: { identifiers?: string[] };
    [key: string]: { identifiers?: string[] } | undefined;
  };
  created_at?: string;
  updated_at?: string;
}

interface OryWebhookBody {
  identity: OryIdentity;
}

interface OrySession {
  authenticated_at?: string;
}

const app = express();
app.use(express.json());

function timingSafeEqualHeader(
  headerValue: string | undefined,
  secret: string,
): boolean {
  const a = Buffer.from(headerValue ?? "");
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyWebhookSecret(req: Request, res: Response, next: NextFunction) {
  if (!timingSafeEqualHeader(req.header("x-webhook-secret"), ORY_WEBHOOK_SECRET as string)) {
    res.status(401).json({ error: "invalid webhook secret" });
    return;
  }
  next();
}

function verifySidebarSecret(req: Request, res: Response, next: NextFunction) {
  if (!timingSafeEqualHeader(req.header("x-zendesk-secret"), ZENDESK_SIDEBAR_SECRET as string)) {
    res.status(401).json({ error: "invalid sidebar secret" });
    return;
  }
  next();
}

const ZENDESK_AUTH = `Basic ${Buffer.from(`${ZENDESK_EMAIL}/token:${ZENDESK_API_TOKEN}`).toString("base64")}`;
const ZENDESK_BASE = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`;

function buildUserFields(identity: OryIdentity): Record<string, unknown> {
  const fields: Record<string, unknown> = { ory_identity_id: identity.id };
  const billing = identity.metadata_public?.billing;
  if (billing && typeof billing === "object") {
    if (billing.plan) fields.subscription_plan = billing.plan;
    if (billing.status) fields.subscription_status = billing.status;
  }
  const risk = identity.metadata_public?.risk_assessment;
  if (risk && typeof risk === "object" && typeof risk.score === "number") {
    fields.risk_score = risk.score;
  }
  return fields;
}

async function upsertZendeskUser(identity: OryIdentity): Promise<void> {
  const fullName =
    [identity.traits?.name?.first, identity.traits?.name?.last]
      .filter((s): s is string => Boolean(s))
      .join(" ") || identity.traits?.email;

  const res = await fetch(`${ZENDESK_BASE}/users/create_or_update`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: ZENDESK_AUTH },
    body: JSON.stringify({
      user: {
        email: identity.traits?.email,
        name: fullName,
        external_id: identity.id,
        verified: true,
        user_fields: buildUserFields(identity),
      },
    }),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Zendesk ${res.status}: ${detail}`);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

function asyncUserSync(label: string) {
  return async (
    req: Request<unknown, unknown, OryWebhookBody>,
    res: Response,
  ) => {
    res.status(200).json({});
    const identity = req.body?.identity;
    if (!identity?.id || !identity.traits?.email) return;
    try {
      await upsertZendeskUser(identity);
      console.log(`Zendesk ${label}: synced ${identity.id} (${identity.traits.email})`);
    } catch (err) {
      console.warn(`Zendesk ${label} sync failed for ${identity.id}: ${(err as Error).message}`);
    }
  };
}

app.post("/zendesk/registration", verifyWebhookSecret, asyncUserSync("registration"));
app.post("/zendesk/settings", verifyWebhookSecret, asyncUserSync("settings"));

// Sidebar lookup: the Zendesk app calls this with the open ticket's requester
// email and renders the response inline. Returns 404 with no body when no
// matching identity exists so the sidebar can display "no Ory identity found"
// without leaking enumeration detail.
app.get("/zendesk/sidebar/identity", verifySidebarSecret, async (req, res) => {
  const email = typeof req.query.email === "string" ? req.query.email : "";
  if (!email) {
    res.status(400).json({ error: "email required" });
    return;
  }

  try {
    const headers = { authorization: `Bearer ${ORY_ADMIN_API_KEY}` };
    const lookupRes = await fetch(
      `${ORY_SDK_URL}/admin/identities?credentials_identifier=${encodeURIComponent(email)}`,
      { headers, signal: AbortSignal.timeout(5000) },
    );
    if (!lookupRes.ok) {
      console.warn(`Zendesk sidebar: Ory lookup ${lookupRes.status}`);
      res.status(502).json({ error: "ory_lookup_failed" });
      return;
    }
    const identities = (await lookupRes.json()) as OryIdentity[];
    if (!Array.isArray(identities) || identities.length === 0) {
      res.status(404).json({ found: false });
      return;
    }
    const identity = identities[0];
    if (!identity) {
      res.status(404).json({ found: false });
      return;
    }

    const sessRes = await fetch(
      `${ORY_SDK_URL}/admin/identities/${identity.id}/sessions?active=true`,
      { headers, signal: AbortSignal.timeout(5000) },
    );
    const sessions: OrySession[] = sessRes.ok ? ((await sessRes.json()) as OrySession[]) : [];

    const hasMfa =
      (identity.credentials?.totp?.identifiers?.length ?? 0) > 0 ||
      (identity.credentials?.webauthn?.identifiers?.length ?? 0) > 0;

    res.json({
      found: true,
      identity: {
        id: identity.id,
        email: identity.traits?.email,
        name: identity.traits?.name,
        state: identity.state,
        created_at: identity.created_at,
        updated_at: identity.updated_at,
        has_mfa: hasMfa,
        active_sessions: Array.isArray(sessions) ? sessions.length : 0,
        last_session:
          Array.isArray(sessions) && sessions.length > 0
            ? sessions[0]?.authenticated_at
            : null,
        metadata_public: identity.metadata_public,
      },
    });
  } catch (err) {
    console.error(`Zendesk sidebar lookup failed: ${(err as Error).message}`);
    res.status(502).json({ error: "ory_lookup_failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Zendesk webhook listening on port ${PORT}`);
});
