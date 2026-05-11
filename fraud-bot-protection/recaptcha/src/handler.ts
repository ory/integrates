/**
 * reCAPTCHA <> Ory Actions Webhook Handler
 *
 * Since Ory Network natively supports only Cloudflare Turnstile, this handler
 * provides Google reCAPTCHA v2/v3 support via a custom Ory Actions webhook.
 *
 * It runs as a SYNCHRONOUS pre-registration/pre-login hook (can_interrupt: true).
 * The client-side app collects the reCAPTCHA token and passes it via Ory's
 * transient_payload field. This handler validates it against Google's siteverify API.
 *
 * SECURITY: The RECAPTCHA_SECRET_KEY must be stored in a secret manager.
 *   - Set RECAPTCHA_SECRET_KEY=6L... for local dev
 *   - Use a secret manager (AWS SM, GCP SM, Vault) in production
 *   - Use a secret manager (Cloud Secret Manager, AWS Secrets Manager, Vault, etc.)
 */

import express from "express";
import { verifyRecaptchaToken } from "./verify";
import type { OryWebhookPayload, OryErrorResponse, RecaptchaConfig } from "./types";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3001", 10);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Configuration — override via environment variables
const recaptchaConfig: RecaptchaConfig = {
  version: (process.env.RECAPTCHA_VERSION as "v2" | "v3") || "v3",
  scoreThreshold: parseFloat(process.env.RECAPTCHA_SCORE_THRESHOLD || "0.5"),
  expectedAction: process.env.RECAPTCHA_EXPECTED_ACTION,
};

// --- Middleware ---

function authenticateWebhook(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (!WEBHOOK_SECRET) {
    next();
    return;
  }
  const provided = req.get("X-Webhook-Secret");
  if (provided !== WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// --- Helpers ---

function extractClientIp(payload: OryWebhookPayload): string | undefined {
  const headers = payload.request_headers;
  if (!headers) return undefined;

  // X-Forwarded-For may contain multiple IPs; take the first (client IP)
  const xff = headers["x-forwarded-for"]?.[0];
  if (xff) {
    return xff.split(",")[0].trim();
  }
  return undefined;
}

function oryError(message: string): OryErrorResponse {
  return {
    messages: [
      {
        instance_ptr: "#/",
        message,
        type: "error",
      },
    ],
  };
}

// --- Routes ---

/**
 * POST /webhooks/recaptcha/verify
 *
 * Called by Ory Actions BEFORE registration or login.
 * Extracts the reCAPTCHA token from transient_payload, validates it,
 * and either allows (200) or blocks (400) the flow.
 */
app.post(
  "/webhooks/recaptcha/verify",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    const payload = req.body as OryWebhookPayload;
    const token = payload.flow?.transient_payload?.recaptcha_token;

    if (!token || typeof token !== "string") {
      console.warn("No recaptcha_token in transient_payload");
      res
        .status(400)
        .json(
          oryError(
            "Please complete the CAPTCHA verification before submitting.",
          ),
        );
      return;
    }

    // IMPORTANT: In production, use a secret manager for RECAPTCHA_SECRET_KEY.
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
      console.error(
        "RECAPTCHA_SECRET_KEY not set. Store it in a secret manager.",
      );
      // Fail open — don't block users if misconfigured, but log the error
      res.status(200).json({});
      return;
    }

    const clientIp = extractClientIp(payload);
    const result = await verifyRecaptchaToken(
      token,
      secretKey,
      clientIp,
      recaptchaConfig,
    );

    if (result.success) {
      console.log(
        `reCAPTCHA verified: score=${result.score}, action=${result.action}`,
      );
      // Allow the flow to proceed
      res.status(200).json({});
    } else {
      console.warn(
        `reCAPTCHA failed: ${result.failureReason}, score=${result.score}`,
      );
      // Block the flow with a user-facing error
      res
        .status(400)
        .json(
          oryError("CAPTCHA verification failed. Please try again."),
        );
    }
  },
);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", integration: "recaptcha" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`reCAPTCHA webhook handler listening on port ${PORT}`);
  });
}

export { app };
