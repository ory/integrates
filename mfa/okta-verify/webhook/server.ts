// SPDX-License-Identifier: Apache-2.0
//
// Reference webhook handler for the Ory <> Okta Verify integration.
// Triggers an Okta Verify push factor and polls until the user responds (or
// the deadline elapses), then returns the verdict so an Ory Action can step
// up authentication or fail the flow.

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
const POLL_DEADLINE_MS =
  Number.parseInt(process.env.OKTA_POLL_DEADLINE_SECONDS || "60", 10) * 1000;

if (!ORY_WEBHOOK_SECRET || !OKTA_ORG_URL || !OKTA_API_TOKEN) {
  console.error("ORY_WEBHOOK_SECRET, OKTA_ORG_URL, OKTA_API_TOKEN must be set");
  process.exit(1);
}

interface OktaChallengeRequest {
  okta_user_id?: string;
}

interface OktaFactor {
  id: string;
  factorType: string;
  status: string;
}

interface OktaVerifyResponse {
  factorResult?: string;
  _links?: { poll?: { href?: string } };
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

async function findPushFactorId(userId: string): Promise<string | null> {
  const res = await fetch(`${OKTA_ORG_URL}/api/v1/users/${userId}/factors`, {
    headers: oktaHeaders,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`okta factors ${res.status}: ${await res.text()}`);
  }
  const factors = (await res.json()) as OktaFactor[];
  const push = factors.find((f) => f.factorType === "push" && f.status === "ACTIVE");
  return push?.id ?? null;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/okta-verify/challenge",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OktaChallengeRequest>, res: Response) => {
    const { okta_user_id } = req.body;
    if (!okta_user_id) {
      res.status(400).json({ error: "okta_user_id is required" });
      return;
    }

    try {
      const factorId = await findPushFactorId(okta_user_id);
      if (!factorId) {
        res.json({ ok: true, mfa_passed: false, reason: "no_push_factor_enrolled" });
        return;
      }

      const verifyRes = await fetch(
        `${OKTA_ORG_URL}/api/v1/users/${okta_user_id}/factors/${factorId}/verify`,
        { method: "POST", headers: oktaHeaders, signal: AbortSignal.timeout(10000) },
      );

      if (!verifyRes.ok) {
        console.error(`Okta verify ${verifyRes.status}: ${await verifyRes.text()}`);
        res.status(502).json({ error: "okta_verify_failed" });
        return;
      }

      let body = (await verifyRes.json()) as OktaVerifyResponse;
      const pollUrl = body._links?.poll?.href;
      if (!pollUrl) {
        res.status(502).json({ error: "missing_poll_url" });
        return;
      }

      const deadline = Date.now() + POLL_DEADLINE_MS;
      let result: string | undefined = body.factorResult;

      while (Date.now() < deadline && result === "WAITING") {
        // 2-second backoff between polls. Okta returns immediately rather than long-polling.
        await new Promise((r) => setTimeout(r, 2000));
        const pollRes = await fetch(pollUrl, {
          headers: oktaHeaders,
          signal: AbortSignal.timeout(10000),
        });
        if (!pollRes.ok) {
          console.error(`Okta poll ${pollRes.status}: ${await pollRes.text()}`);
          res.status(502).json({ error: "okta_poll_failed" });
          return;
        }
        body = (await pollRes.json()) as OktaVerifyResponse;
        result = body.factorResult;
      }

      res.json({
        ok: true,
        result, // SUCCESS / REJECTED / TIMEOUT / WAITING (if deadline hit)
        mfa_passed: result === "SUCCESS",
      });
    } catch (err) {
      console.error("Okta error:", (err as Error).message);
      res.status(502).json({ error: "okta_failed" });
    }
  },
);

app.listen(PORT, () => {
  console.log(`Okta Verify integration listening on port ${PORT}`);
});
