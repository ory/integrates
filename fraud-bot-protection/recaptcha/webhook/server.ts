// SPDX-License-Identifier: Apache-2.0
//
// Google reCAPTCHA v2/v3 <> Ory Actions webhook handler.
//
// Ory Network natively integrates Cloudflare Turnstile; for reCAPTCHA, the
// integration runs as a custom sync pre-flow hook (response.parse: true,
// can_interrupt: true). The client sends the reCAPTCHA token via Ory's
// transient_payload; this handler exchanges it for a verdict against
// Google's siteverify API, applies the v3 score threshold and optional
// action match, and either lets the flow proceed (200) or interrupts it
// with a user-facing message (400).
//
// Versions: set RECAPTCHA_VERSION=v2 to skip score/action checks; v3 (default)
// applies RECAPTCHA_SCORE_THRESHOLD and (optional) RECAPTCHA_EXPECTED_ACTION.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
const RECAPTCHA_VERSION: "v2" | "v3" =
  process.env.RECAPTCHA_VERSION === "v2" ? "v2" : "v3";
const RECAPTCHA_SCORE_THRESHOLD = parseFloat(
  process.env.RECAPTCHA_SCORE_THRESHOLD || "0.5",
);
const RECAPTCHA_EXPECTED_ACTION = process.env.RECAPTCHA_EXPECTED_ACTION || "";
const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

if (!ORY_WEBHOOK_SECRET || !RECAPTCHA_SECRET_KEY) {
  console.error("ORY_WEBHOOK_SECRET and RECAPTCHA_SECRET_KEY must be set in .env");
  process.exit(1);
}

interface OryWebhookBody {
  flow?: {
    transient_payload?: { recaptcha_token?: string };
  };
  request_headers?: Record<string, string[]>;
}

interface SiteverifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  "error-codes"?: string[];
}

type VerifyResult =
  | { ok: true; score?: number; action?: string }
  | { ok: false; reason: string; score?: number; action?: string };

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

function flowError(message: string) {
  return {
    messages: [{ instance_ptr: "#/", message, type: "error" }],
  };
}

function extractClientIp(body: OryWebhookBody): string | undefined {
  const xff = body?.request_headers?.["x-forwarded-for"]?.[0];
  return xff ? xff.split(",")[0]?.trim() : undefined;
}

async function verifyToken(
  token: string,
  clientIp: string | undefined,
): Promise<VerifyResult> {
  const params = new URLSearchParams({
    secret: RECAPTCHA_SECRET_KEY as string,
    response: token,
  });
  if (clientIp) params.set("remoteip", clientIp);

  const res = await fetch(SITEVERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    return { ok: false, reason: `siteverify HTTP ${res.status}` };
  }

  const data = (await res.json()) as SiteverifyResponse;

  if (RECAPTCHA_VERSION === "v2") {
    return data.success
      ? { ok: true }
      : { ok: false, reason: `verification failed: ${(data["error-codes"] ?? []).join(",")}` };
  }

  // v3 checks
  if (!data.success) {
    return {
      ok: false,
      reason: `verification failed: ${(data["error-codes"] ?? []).join(",")}`,
      score: data.score,
      action: data.action,
    };
  }
  const score = typeof data.score === "number" ? data.score : 0;
  if (score < RECAPTCHA_SCORE_THRESHOLD) {
    return {
      ok: false,
      reason: `score ${score} < threshold ${RECAPTCHA_SCORE_THRESHOLD}`,
      score,
      action: data.action,
    };
  }
  if (RECAPTCHA_EXPECTED_ACTION && data.action !== RECAPTCHA_EXPECTED_ACTION) {
    return {
      ok: false,
      reason: `action "${data.action}" != expected "${RECAPTCHA_EXPECTED_ACTION}"`,
      score,
      action: data.action,
    };
  }
  return { ok: true, score, action: data.action };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Sync pre-flow hook. Interrupts the flow with a 400 + user-facing message
// when the token is missing, invalid, or below threshold. Allowed flows pass
// through with a plain 200 (no identity mutation).
app.post(
  "/recaptcha/verify",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OryWebhookBody>, res: Response) => {
    const token = req.body?.flow?.transient_payload?.recaptcha_token;
    if (!token || typeof token !== "string") {
      res
        .status(400)
        .json(flowError("Please complete the CAPTCHA verification before submitting."));
      return;
    }

    try {
      const result = await verifyToken(token, extractClientIp(req.body));
      if (result.ok) {
        console.log(
          `reCAPTCHA verified: score=${result.score ?? "n/a"} action=${result.action ?? "n/a"}`,
        );
        res.status(200).json({});
        return;
      }
      console.warn(`reCAPTCHA rejected: ${result.reason}`);
      res
        .status(400)
        .json(flowError("CAPTCHA verification failed. Please try again."));
    } catch (err) {
      console.error(`reCAPTCHA verify error: ${(err as Error).message}`);
      // Fail closed: a verify outage shouldn't quietly let bots through.
      res
        .status(400)
        .json(flowError("CAPTCHA verification is temporarily unavailable. Please try again."));
    }
  },
);

app.listen(PORT, () => {
  console.log(`reCAPTCHA webhook listening on port ${PORT}`);
});
