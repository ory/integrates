// SPDX-License-Identifier: Apache-2.0
//
// Reference webhook handler for the Ory <> Okta Verify integration.
// Verifies an Okta Verify one-time code that the login UI collected with the
// primary credentials and blocks the sign-in unless Okta accepts it.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const OKTA_ORG_URL = process.env.OKTA_ORG_URL; // e.g. https://your-org.okta.com
const OKTA_API_TOKEN = process.env.OKTA_API_TOKEN;
const OKTA_ALLOW_UNENROLLED = process.env.OKTA_ALLOW_UNENROLLED === "true";

if (!ORY_WEBHOOK_SECRET || !OKTA_ORG_URL || !OKTA_API_TOKEN) {
  console.error("ORY_WEBHOOK_SECRET, OKTA_ORG_URL, OKTA_API_TOKEN must be set");
  process.exit(1);
}

interface OktaVerifyRequest {
  identity_id?: string;
  okta_user_id?: string | null;
  pass_code?: string | null;
}

interface OktaFactor {
  id: string;
  factorType: string;
  provider: string;
  status: string;
}

interface OktaVerifyResponse {
  factorResult?: string;
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

const oktaHeaders: Record<string, string> = {
  authorization: `SSWS ${OKTA_API_TOKEN}`,
  accept: "application/json",
  "content-type": "application/json",
};

class UnenrolledError extends Error {}

// Okta Verify registers its one-time code as a software TOTP factor.
async function findTotpFactorId(userId: string): Promise<string> {
  const res = await fetch(
    `${OKTA_ORG_URL}/api/v1/users/${encodeURIComponent(userId)}/factors`,
    { headers: oktaHeaders, signal: AbortSignal.timeout(8000) },
  );
  if (res.status === 404) throw new UnenrolledError("okta user not found");
  if (!res.ok) {
    throw new Error(`okta factors ${res.status}: ${await res.text()}`);
  }
  const factors = (await res.json()) as OktaFactor[];
  const totp = factors.find(
    (f) =>
      f.factorType === "token:software:totp" &&
      f.provider === "OKTA" &&
      f.status === "ACTIVE",
  );
  if (!totp) throw new UnenrolledError("no active Okta Verify code factor");
  return totp.id;
}

// Ory Kratos Identities shows these messages to the user when the handler
// responds with a 4xx status code. Ory retries a 5xx, so failures are reported
// as a 4xx.
function block(res: Response, id: number, text: string) {
  res.status(403).json({
    messages: [
      {
        instance_ptr: "#/",
        messages: [{ id, text, type: "error" }],
      },
    ],
  });
}

function unenrolled(res: Response) {
  if (OKTA_ALLOW_UNENROLLED) {
    res.status(200).json({});
    return;
  }
  block(res, 9002001, "Set up Okta Verify before you sign in.");
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/okta-verify/verify",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OktaVerifyRequest>, res: Response) => {
    const { okta_user_id, pass_code } = req.body ?? {};
    if (!okta_user_id) {
      unenrolled(res);
      return;
    }

    try {
      const factorId = await findTotpFactorId(okta_user_id);
      if (!pass_code) {
        block(res, 9002002, "Enter the code from Okta Verify.");
        return;
      }

      const verifyRes = await fetch(
        `${OKTA_ORG_URL}/api/v1/users/${encodeURIComponent(okta_user_id)}/factors/${encodeURIComponent(factorId)}/verify`,
        {
          method: "POST",
          headers: oktaHeaders,
          body: JSON.stringify({ passCode: pass_code }),
          signal: AbortSignal.timeout(8000),
        },
      );

      // Okta answers an invalid code with 403 (E0000068).
      if (verifyRes.status === 403) {
        block(res, 9002003, "The Okta Verify code is invalid.");
        return;
      }
      if (!verifyRes.ok) {
        console.error(`Okta verify ${verifyRes.status}: ${await verifyRes.text()}`);
        block(res, 9002004, "Okta Verify is unavailable. Please try again.");
        return;
      }

      const body = (await verifyRes.json()) as OktaVerifyResponse;
      if (body.factorResult !== "SUCCESS") {
        block(res, 9002003, "The Okta Verify code is invalid.");
        return;
      }

      res.status(200).json({});
    } catch (err) {
      if (err instanceof UnenrolledError) {
        unenrolled(res);
        return;
      }
      console.error("Okta error:", (err as Error).message);
      block(res, 9002004, "Okta Verify is unavailable. Please try again.");
    }
  },
);

app.listen(PORT, () => {
  console.log(`Okta Verify integration listening on port ${PORT}`);
});
