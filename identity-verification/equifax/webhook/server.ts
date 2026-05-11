// SPDX-License-Identifier: Apache-2.0
//
// Reference webhook handler for the Ory <> Equifax integration.
// Receives an Ory Action webhook, exchanges client credentials for an OAuth 2.0
// access token (cached, refreshed ~5 min before expiry), and calls the Equifax
// Digital Identity Trust API. Returns the decision and trust score so Ory's
// post-flow Action can apply policy (e.g., gate a registration).

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const EQUIFAX_API_BASE = process.env.EQUIFAX_API_BASE || "https://api.sandbox.equifax.com";
const EQUIFAX_CLIENT_ID = process.env.EQUIFAX_CLIENT_ID;
const EQUIFAX_CLIENT_SECRET = process.env.EQUIFAX_CLIENT_SECRET;
const EQUIFAX_SCOPE = process.env.EQUIFAX_SCOPE;

if (!ORY_WEBHOOK_SECRET || !EQUIFAX_CLIENT_ID || !EQUIFAX_CLIENT_SECRET || !EQUIFAX_SCOPE) {
  console.error(
    "ORY_WEBHOOK_SECRET, EQUIFAX_CLIENT_ID, EQUIFAX_CLIENT_SECRET, EQUIFAX_SCOPE must be set in .env",
  );
  process.exit(1);
}

interface OryWebhookBody {
  identity_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  ssn_last_four?: string;
  address?: Record<string, unknown>;
}

interface EquifaxTokenResponse {
  access_token: string;
  expires_in?: number;
}

interface EquifaxVerifyResponse {
  decision?: string;
  outcome?: string;
  trustScore?: number;
  referenceId?: string;
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

// Token cache — Equifax access tokens are short-lived, refresh ~5 min before expiry.
let cachedToken: string | null = null;
let cachedExpiry = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedExpiry - 5 * 60 * 1000) return cachedToken;

  const basic = Buffer.from(`${EQUIFAX_CLIENT_ID}:${EQUIFAX_CLIENT_SECRET}`).toString("base64");
  const tokenRes = await fetch(`${EQUIFAX_API_BASE}/v2/oauth/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: EQUIFAX_SCOPE as string }),
    signal: AbortSignal.timeout(10000),
  });

  if (!tokenRes.ok) {
    throw new Error(`equifax token ${tokenRes.status}: ${await tokenRes.text()}`);
  }

  const data = (await tokenRes.json()) as EquifaxTokenResponse;
  cachedToken = data.access_token;
  cachedExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
  return cachedToken;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/equifax/verify-identity",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OryWebhookBody>, res: Response) => {
    const { identity_id, email, first_name, last_name, date_of_birth, ssn_last_four, address } =
      req.body;

    if (!email || !first_name || !last_name) {
      res.status(400).json({ error: "email, first_name, last_name are required" });
      return;
    }

    try {
      const token = await getToken();
      // The path varies by Equifax product — adjust to the product you've been entitled to.
      const verifyRes = await fetch(`${EQUIFAX_API_BASE}/business/v1/identity-verifications`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          externalReferenceId: identity_id,
          consumer: {
            name: { firstName: first_name, lastName: last_name },
            dateOfBirth: date_of_birth,
            ...(ssn_last_four && { ssn: { last4: ssn_last_four } }),
            email,
            address,
          },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!verifyRes.ok) {
        console.error(`Equifax ${verifyRes.status}: ${await verifyRes.text()}`);
        res.status(502).json({ error: "equifax_error" });
        return;
      }

      const result = (await verifyRes.json()) as EquifaxVerifyResponse;
      res.json({
        ok: true,
        decision: result.decision ?? result.outcome,
        trust_score: result.trustScore ?? null,
        reference_id: result.referenceId ?? null,
      });
    } catch (err) {
      console.error("Verify error:", (err as Error).message);
      res.status(502).json({ error: "verify_failed" });
    }
  },
);

app.listen(PORT, () => {
  console.log(`Equifax integration listening on port ${PORT}`);
});
