// SPDX-License-Identifier: Apache-2.0
//
// OneTrust <> Ory Actions webhook handler.
//
// Two surfaces:
//
//   1. Post-registration (Ory -> handler) — sync hook that captures the
//      user's consent choices from transient_payload, writes them to
//      identity.metadata_public.consent so Ory holds the record of truth,
//      and records a consent receipt in OneTrust via the Consent Manager
//      API. The Ory call is synchronous (response.parse: true) so the
//      consent metadata lands on the new identity; the OneTrust receipt
//      call runs after the response goes back so OneTrust availability
//      never blocks registration.
//
//   2. DSR callback (OneTrust -> handler) — async webhook from OneTrust's
//      Privacy Rights Automation workflow. Authenticates with a separate
//      shared secret (X-OneTrust-Secret), then dispatches DELETE/ERASURE,
//      EXPORT/ACCESS, or RECTIFICATION against Ory's Admin API.
//
// OneTrust authenticates with OAuth2 client_credentials. The handler caches
// the access token in memory until 30s before its declared expiry and then
// fetches a new one on demand.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const ONETRUST_DSR_SECRET = process.env.ONETRUST_DSR_SECRET;
const ONETRUST_HOST = process.env.ONETRUST_HOST || "app.onetrust.com";
const ONETRUST_CLIENT_ID = process.env.ONETRUST_CLIENT_ID;
const ONETRUST_CLIENT_SECRET = process.env.ONETRUST_CLIENT_SECRET;
const ORY_SDK_URL = process.env.ORY_SDK_URL;
const ORY_ADMIN_API_KEY = process.env.ORY_ADMIN_API_KEY;

if (
  !ORY_WEBHOOK_SECRET ||
  !ONETRUST_DSR_SECRET ||
  !ONETRUST_CLIENT_ID ||
  !ONETRUST_CLIENT_SECRET ||
  !ORY_SDK_URL ||
  !ORY_ADMIN_API_KEY
) {
  console.error("Missing required env vars. See .env.example for the full list.");
  process.exit(1);
}

// Map a consent category name (the key in transient_payload.consent) to a
// OneTrust Purpose ID. Override per category via env vars; categories without
// a configured purpose ID are skipped in the receipt.
const PURPOSE_MAP: Record<string, string | undefined> = {
  marketing: process.env.ONETRUST_PURPOSE_MARKETING,
  analytics: process.env.ONETRUST_PURPOSE_ANALYTICS,
  functional: process.env.ONETRUST_PURPOSE_FUNCTIONAL,
  essential: process.env.ONETRUST_PURPOSE_ESSENTIAL,
  personalization: process.env.ONETRUST_PURPOSE_PERSONALIZATION,
};

interface OryIdentity {
  id: string;
  schema_id?: string;
  state?: string;
  traits?: { email?: string; [trait: string]: unknown };
  metadata_public?: Record<string, unknown>;
  metadata_admin?: Record<string, unknown>;
}

interface OryRegistrationWebhookBody {
  identity: OryIdentity;
  flow: {
    transient_payload?: { consent?: Record<string, boolean> };
  };
}

interface OneTrustDsrBody {
  requestType?: string;
  dataSubject?: {
    email?: string;
    corrections?: Record<string, unknown>;
  };
  identifier?: string;
  email?: string;
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

function verifyOryWebhookSecret(req: Request, res: Response, next: NextFunction) {
  if (!timingSafeEqualHeader(req.header("x-webhook-secret"), ORY_WEBHOOK_SECRET as string)) {
    res.status(401).json({ error: "invalid webhook secret" });
    return;
  }
  next();
}

function verifyOneTrustDsrSecret(req: Request, res: Response, next: NextFunction) {
  if (!timingSafeEqualHeader(req.header("x-onetrust-secret"), ONETRUST_DSR_SECRET as string)) {
    res.status(401).json({ error: "invalid onetrust secret" });
    return;
  }
  next();
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

async function getOneTrustAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 30_000 > now) return cachedToken.token;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: ONETRUST_CLIENT_ID as string,
    client_secret: ONETRUST_CLIENT_SECRET as string,
  });
  const res = await fetch(`https://${ONETRUST_HOST}/api/access/v1/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OneTrust OAuth ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  const lifetimeMs = (data.expires_in ?? 3600) * 1000;
  cachedToken = { token: data.access_token, expiresAt: now + lifetimeMs };
  return cachedToken.token;
}

async function recordConsentReceipt(
  identity: OryIdentity,
  consent: Record<string, boolean>,
): Promise<void> {
  const purposes = Object.entries(consent)
    .filter(([key]) => Boolean(PURPOSE_MAP[key]))
    .map(([key, granted]) => ({
      Id: PURPOSE_MAP[key],
      Name: key,
      TransactionType: granted ? "CONFIRMED" : "OPT_OUT",
    }));
  if (purposes.length === 0) return; // nothing mapped, nothing to send

  const token = await getOneTrustAccessToken();
  const receipt = {
    identifier: identity.traits?.email,
    identifierType: "email",
    requestInformation: {
      language: "en-us",
      collectionPoint: "registration",
      collectionMethod: "web_form",
    },
    purposes,
    dsDataElements: [{ Name: "ory_identity_id", Value: identity.id }],
    consentDate: new Date().toISOString(),
  };

  const res = await fetch(
    `https://${ONETRUST_HOST}/api/consentmanager/v2/consent-receipts`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(receipt),
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OneTrust receipt ${res.status}: ${detail}`);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Sync post-registration. Consent goes into metadata_public IMMEDIATELY via the
// response so Ory holds it even if OneTrust is unreachable; OneTrust is then
// called in the background (after the response is flushed).
app.post(
  "/onetrust/registration",
  verifyOryWebhookSecret,
  async (req: Request<unknown, unknown, OryRegistrationWebhookBody>, res: Response) => {
    const identity = req.body?.identity;
    const consent = req.body?.flow?.transient_payload?.consent;

    if (consent && typeof consent === "object") {
      res.status(200).json({
        identity: {
          metadata_public: {
            consent: { preferences: consent, recorded_at: new Date().toISOString() },
          },
        },
      });
    } else {
      res.status(200).json({});
    }

    if (consent && identity?.id && identity.traits?.email) {
      try {
        await recordConsentReceipt(identity, consent);
        console.log(`OneTrust: receipt recorded for ${identity.id}`);
      } catch (err) {
        console.warn(`OneTrust receipt failed for ${identity.id}: ${(err as Error).message}`);
      }
    }
  },
);

async function findIdentityByEmail(email: string): Promise<OryIdentity | null> {
  const res = await fetch(
    `${ORY_SDK_URL}/admin/identities?credentials_identifier=${encodeURIComponent(email)}`,
    {
      headers: { authorization: `Bearer ${ORY_ADMIN_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!res.ok) throw new Error(`Ory lookup ${res.status}`);
  const arr = (await res.json()) as OryIdentity[];
  return Array.isArray(arr) && arr.length > 0 ? (arr[0] ?? null) : null;
}

// DSR callback from OneTrust's Privacy Rights Automation workflow.
// requestType: DELETE | ERASURE | EXPORT | ACCESS | RECTIFICATION
// The handler runs the action against Ory's Admin API and returns a status to
// OneTrust. OneTrust treats 2xx as completed and 4xx/5xx as failed.
app.post(
  "/onetrust/dsr",
  verifyOneTrustDsrSecret,
  async (req: Request<unknown, unknown, OneTrustDsrBody>, res: Response) => {
    const requestType = String(req.body?.requestType ?? "").toUpperCase();
    const email =
      req.body?.dataSubject?.email ?? req.body?.identifier ?? req.body?.email;
    if (!email) {
      res.status(400).json({ error: "email required" });
      return;
    }

    try {
      const identity = await findIdentityByEmail(email);
      if (!identity) {
        res.status(404).json({ error: "identity_not_found" });
        return;
      }

      const headers = {
        "content-type": "application/json",
        authorization: `Bearer ${ORY_ADMIN_API_KEY}`,
      };

      if (requestType === "DELETE" || requestType === "ERASURE") {
        const del = await fetch(`${ORY_SDK_URL}/admin/identities/${identity.id}`, {
          method: "DELETE",
          headers,
          signal: AbortSignal.timeout(5000),
        });
        if (!del.ok) throw new Error(`Ory delete ${del.status}`);
        console.log(`OneTrust DSR: deleted ${identity.id}`);
        res.json({ status: "completed", action: "deleted" });
        return;
      }

      if (requestType === "EXPORT" || requestType === "ACCESS") {
        res.json({
          status: "completed",
          action: "exported",
          data: {
            id: identity.id,
            traits: identity.traits,
            metadata_public: identity.metadata_public,
            state: identity.state,
          },
        });
        return;
      }

      if (requestType === "RECTIFICATION") {
        const corrections = req.body?.dataSubject?.corrections;
        if (!corrections || typeof corrections !== "object") {
          res.status(400).json({ error: "corrections required" });
          return;
        }
        const put = await fetch(`${ORY_SDK_URL}/admin/identities/${identity.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            schema_id: identity.schema_id,
            traits: { ...(identity.traits ?? {}), ...corrections },
            state: identity.state,
            metadata_public: identity.metadata_public,
            metadata_admin: identity.metadata_admin,
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (!put.ok) throw new Error(`Ory put ${put.status}`);
        console.log(`OneTrust DSR: rectified ${identity.id}`);
        res.json({ status: "completed", action: "rectified" });
        return;
      }

      res.status(400).json({ error: `unsupported requestType: ${requestType}` });
    } catch (err) {
      console.error(`OneTrust DSR failed: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.listen(PORT, () => {
  console.log(`OneTrust webhook listening on port ${PORT}`);
});
