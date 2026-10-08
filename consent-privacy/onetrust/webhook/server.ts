// SPDX-License-Identifier: Apache-2.0
//
// OneTrust <> Ory Actions webhook handler.
//
// Three surfaces:
//
//   1. POST /onetrust/registration (Ory -> handler, response.parse: true).
//      Runs before Ory saves the identity and returns the user's consent
//      choices in identity.metadata_public.consent. The identity has no ID
//      yet, so this route doesn't call OneTrust.
//
//   2. POST /onetrust/receipt (Ory -> handler, response.ignore: true). Runs
//      after Ory saves the identity and records a OneTrust consent receipt
//      keyed by the Ory identity ID.
//
//   3. POST /onetrust/dsr (OneTrust -> handler). Called by OneTrust's Privacy
//      Rights Automation workflow with a separate shared secret
//      (X-OneTrust-Secret). Dispatches DELETE/ERASURE, EXPORT/ACCESS, or
//      RECTIFICATION against Ory's Admin API for the stored Ory identity ID.
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
  traits?: Record<string, unknown>;
  metadata_public?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

// Shape produced by jsonnet/registration.jsonnet.
interface OryRegistrationWebhookBody {
  identity?: {
    id?: string;
    email?: string | null;
    metadata_public?: Record<string, unknown>;
  };
  consent?: Record<string, unknown> | null;
}

interface OneTrustDsrBody {
  requestType?: string;
  oryIdentityId?: string;
  dataSubject?: {
    oryIdentityId?: string;
    corrections?: Record<string, unknown>;
  };
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function consentChoices(value: unknown): Record<string, boolean> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const choices = Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
  );
  return Object.keys(choices).length > 0 ? choices : null;
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
  identityId: string,
  email: string | undefined,
  consent: Record<string, boolean>,
): Promise<void> {
  const purposes = Object.entries(consent)
    .filter(([key]) => Boolean(PURPOSE_MAP[key]))
    .map(([key, granted]) => ({
      Id: PURPOSE_MAP[key],
      Name: key,
      TransactionType: granted ? "CONFIRMED" : "OPT_OUT",
    }));
  if (purposes.length === 0) return;

  const token = await getOneTrustAccessToken();
  const receipt = {
    identifier: identityId,
    requestInformation: {
      language: "en-us",
      collectionPoint: "registration",
      collectionMethod: "web_form",
    },
    purposes,
    dsDataElements: [
      { Name: "ory_identity_id", Value: identityId },
      ...(email ? [{ Name: "email", Value: email }] : []),
    ],
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

// Ory replaces metadata_public as a whole, so the response carries the
// existing metadata alongside the new consent record. Any input problem
// returns 200 with no changes so registration is never blocked.
app.post(
  "/onetrust/registration",
  verifyOryWebhookSecret,
  (req: Request<unknown, unknown, OryRegistrationWebhookBody>, res: Response) => {
    const consent = consentChoices(req.body?.consent);
    if (!consent) {
      res.status(200).json({});
      return;
    }
    const existing = req.body?.identity?.metadata_public;
    const metadataPublic =
      existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
    res.status(200).json({
      identity: {
        metadata_public: {
          ...metadataPublic,
          consent: { preferences: consent, recorded_at: new Date().toISOString() },
        },
      },
    });
  },
);

// Ory ignores this response but retries 429 and 5xx responses other than 501,
// so a failed OneTrust call returns 502.
app.post(
  "/onetrust/receipt",
  verifyOryWebhookSecret,
  async (req: Request<unknown, unknown, OryRegistrationWebhookBody>, res: Response) => {
    const identityId = req.body?.identity?.id;
    const consent = consentChoices(req.body?.consent);
    if (!consent || !identityId || identityId === NIL_UUID) {
      res.status(200).json({});
      return;
    }

    try {
      await recordConsentReceipt(identityId, req.body?.identity?.email ?? undefined, consent);
      console.log(`OneTrust: receipt recorded for ${identityId}`);
      res.status(200).json({});
    } catch (err) {
      console.warn(`OneTrust receipt failed for ${identityId}: ${(err as Error).message}`);
      res.status(502).json({ error: "receipt_failed" });
    }
  },
);

async function getIdentity(id: string): Promise<OryIdentity | null> {
  const res = await fetch(`${ORY_SDK_URL}/admin/identities/${id}`, {
    headers: { authorization: `Bearer ${ORY_ADMIN_API_KEY}` },
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Ory lookup ${res.status}`);
  return (await res.json()) as OryIdentity;
}

function escapeJsonPointer(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

// DSR callback from OneTrust's Privacy Rights Automation workflow.
// requestType: DELETE | ERASURE | EXPORT | ACCESS | RECTIFICATION
// OneTrust treats 2xx as completed and 4xx/5xx as failed.
app.post(
  "/onetrust/dsr",
  verifyOneTrustDsrSecret,
  async (req: Request<unknown, unknown, OneTrustDsrBody>, res: Response) => {
    const requestType = String(req.body?.requestType ?? "").toUpperCase();
    const identityId = req.body?.oryIdentityId ?? req.body?.dataSubject?.oryIdentityId;
    if (!identityId || !UUID_PATTERN.test(identityId)) {
      res.status(400).json({ error: "oryIdentityId required" });
      return;
    }

    try {
      const identity = await getIdentity(identityId);
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
        if (!del.ok && del.status !== 404) throw new Error(`Ory delete ${del.status}`);
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
            created_at: identity.created_at,
            updated_at: identity.updated_at,
          },
        });
        return;
      }

      if (requestType === "RECTIFICATION") {
        const corrections = req.body?.dataSubject?.corrections;
        if (!corrections || typeof corrections !== "object" || Object.keys(corrections).length === 0) {
          res.status(400).json({ error: "corrections required" });
          return;
        }
        const patch = Object.entries(corrections).map(([key, value]) => ({
          op: "add",
          path: `/traits/${escapeJsonPointer(key)}`,
          value,
        }));
        const upd = await fetch(`${ORY_SDK_URL}/admin/identities/${identity.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(patch),
          signal: AbortSignal.timeout(5000),
        });
        if (!upd.ok) throw new Error(`Ory patch ${upd.status}`);
        console.log(`OneTrust DSR: rectified ${identity.id}`);
        res.json({ status: "completed", action: "rectified" });
        return;
      }

      res.status(400).json({ error: `unsupported requestType: ${requestType}` });
    } catch (err) {
      console.error(`OneTrust DSR failed: ${(err as Error).message}`);
      res.status(500).json({ error: "dsr_failed" });
    }
  },
);

app.listen(PORT, () => {
  console.log(`OneTrust webhook listening on port ${PORT}`);
});
