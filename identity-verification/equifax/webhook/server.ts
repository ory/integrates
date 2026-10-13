// SPDX-License-Identifier: Apache-2.0
//
// Reference webhook handler for the Ory <> Equifax integration.
// Receives an Ory Action webhook, exchanges client credentials for an OAuth 2.0
// access token (cached, refreshed ~5 min before expiry), and calls the Equifax
// Digital Identity Trust API. A passing decision returns 200 with the result
// stored on the new identity; any other decision rejects the registration.

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
// Decision values vary by Equifax product. Only these values let the
// registration through; set them to the passing values of your product.
const EQUIFAX_PASS_DECISIONS = (process.env.EQUIFAX_PASS_DECISIONS || "APPROVE,PASS,ACCEPT")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

if (!ORY_WEBHOOK_SECRET || !EQUIFAX_CLIENT_ID || !EQUIFAX_CLIENT_SECRET || !EQUIFAX_SCOPE) {
  console.error(
    "ORY_WEBHOOK_SECRET, EQUIFAX_CLIENT_ID, EQUIFAX_CLIENT_SECRET, EQUIFAX_SCOPE must be set in .env",
  );
  process.exit(1);
}

interface OryWebhookBody {
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

// Ory Kratos Identities rejects the flow and shows `text` to the user only for
// a 4xx response in this shape.
function rejectFlow(res: Response, id: number, text: string) {
  res.status(400).json({
    messages: [{ instance_ptr: "#/", messages: [{ id, text, type: "error" }] }],
  });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/equifax/verify-identity",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OryWebhookBody>, res: Response) => {
    const { email, first_name, last_name, date_of_birth, ssn_last_four, address } = req.body;

    if (!email || !first_name || !last_name) {
      rejectFlow(res, 9000101, "Please provide your first name, last name, and email address.");
      return;
    }

    // The identity is not saved yet, so the handler creates its own reference
    // and stores it as the identity's external_id.
    const reference = crypto.randomUUID();

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
          externalReferenceId: reference,
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
      const decision = (result.decision ?? result.outcome ?? "").toUpperCase();
      if (!EQUIFAX_PASS_DECISIONS.includes(decision)) {
        console.log(`Equifax rejected registration: ref=${reference} decision=${decision || "none"}`);
        rejectFlow(res, 9000102, "We couldn't verify your identity.");
        return;
      }

      res.json({
        identity: {
          external_id: reference,
          metadata_admin: {
            equifax_verification_status: "verified",
            equifax_decision: decision,
            equifax_trust_score: result.trustScore ?? null,
            equifax_reference_id: result.referenceId ?? null,
          },
        },
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
