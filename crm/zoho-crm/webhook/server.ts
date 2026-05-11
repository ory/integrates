// SPDX-License-Identifier: Apache-2.0
//
// Reference webhook handler for the Ory <> Zoho CRM integration.
// Receives Ory Action webhooks, exchanges a long-lived refresh token for a
// short-lived Zoho access token (cached), and upserts a Contact record by
// email using Zoho's bulk upsert endpoint.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;
const ZOHO_API_BASE_URL = process.env.ZOHO_API_BASE_URL ?? "https://www.zohoapis.com/crm/v2";
const ZOHO_ACCOUNTS_URL = process.env.ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.com";

if (
  !ORY_WEBHOOK_SECRET ||
  !ZOHO_CLIENT_ID ||
  !ZOHO_CLIENT_SECRET ||
  !ZOHO_REFRESH_TOKEN
) {
  console.error(
    "ORY_WEBHOOK_SECRET, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN must be set in .env",
  );
  process.exit(1);
}

interface OryIdentity {
  id?: string;
  traits?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    given_name?: string;
    family_name?: string;
    name?: { first?: string; last?: string };
  };
}
interface ZohoSyncRequest {
  identity?: OryIdentity;
  ctx?: { identity?: OryIdentity };
}
interface ZohoTokenResponse {
  access_token: string;
  expires_in?: number;
}

const app = express();
app.use(express.json());

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

let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt - 100_000) {
    return cachedAccessToken;
  }

  const params = new URLSearchParams({
    refresh_token: ZOHO_REFRESH_TOKEN as string,
    client_id: ZOHO_CLIENT_ID as string,
    client_secret: ZOHO_CLIENT_SECRET as string,
    grant_type: "refresh_token",
  });

  const res = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`Zoho token ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as ZohoTokenResponse;
  cachedAccessToken = data.access_token;
  cachedAccessTokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  return cachedAccessToken;
}

function deriveNames(traits: OryIdentity["traits"]): { firstName: string; lastName: string } {
  const firstName =
    traits?.firstName ?? traits?.given_name ?? traits?.name?.first ?? "Unknown";
  const lastName =
    traits?.lastName ?? traits?.family_name ?? traits?.name?.last ?? "User";
  return { firstName, lastName };
}

async function upsertContact(identity: OryIdentity): Promise<void> {
  const email = identity.traits?.email;
  if (!email) throw new Error("identity.traits.email is required");
  const { firstName, lastName } = deriveNames(identity.traits);
  const accessToken = await getAccessToken();

  const res = await fetch(`${ZOHO_API_BASE_URL}/Contacts/upsert`, {
    method: "POST",
    headers: {
      authorization: `Zoho-oauthtoken ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      data: [{ Email: email, First_Name: firstName, Last_Name: lastName }],
      duplicate_check_fields: ["Email"],
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Zoho upsert ${res.status}: ${detail}`);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, zohoConfigured: Boolean(ZOHO_REFRESH_TOKEN) });
});

app.post(
  "/zoho-crm/sync-user",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, ZohoSyncRequest>, res: Response) => {
    const identity = req.body.identity ?? req.body.ctx?.identity;
    if (!identity?.traits?.email) {
      res.status(400).json({ error: "identity.traits.email is required" });
      return;
    }

    try {
      await upsertContact(identity);
      res.json({ success: true, email: identity.traits.email });
    } catch (err) {
      console.error("Zoho sync error:", (err as Error).message);
      res.status(502).json({ error: "zoho_error", details: (err as Error).message });
    }
  },
);

app.listen(PORT, () => {
  console.log(`Zoho CRM integration listening on port ${PORT}`);
});
