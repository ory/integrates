// SPDX-License-Identifier: Apache-2.0
//
// Reference handler that validates Telegram Login Widget payloads.
//
// Telegram has no OIDC. The Login Widget posts an HMAC-SHA256-signed payload
// to a customer-provided URL. This handler:
//   1. Verifies the X-Webhook-Secret from the calling application.
//   2. Verifies the Telegram-side HMAC against the bot token.
//   3. Returns the validated profile so the application can call the Ory Admin
//      API to upsert an identity matching telegram.id and start a session.
//
// Spec: https://core.telegram.org/widgets/login#checking-authorization

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MAX_AGE_S = Number.parseInt(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS || "86400", 10);

if (!ORY_WEBHOOK_SECRET || !BOT_TOKEN) {
  console.error("ORY_WEBHOOK_SECRET and TELEGRAM_BOT_TOKEN must be set");
  process.exit(1);
}

// Per Telegram's spec, the secret key is SHA256(bot_token).
const SECRET_KEY = crypto.createHash("sha256").update(BOT_TOKEN).digest();

interface TelegramLoginPayload {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date?: number | string;
  hash?: string;
  [field: string]: string | number | undefined;
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

function verifyTelegramHmac(payload: TelegramLoginPayload): boolean {
  const { hash, ...rest } = payload;
  if (!hash || typeof hash !== "string") return false;

  const dataCheckString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("\n");

  const calculated = crypto.createHmac("sha256", SECRET_KEY).update(dataCheckString).digest("hex");
  const a = Buffer.from(hash);
  const b = Buffer.from(calculated);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/telegram/validate",
  verifyWebhookSecret,
  (req: Request<unknown, unknown, TelegramLoginPayload>, res: Response) => {
    const payload = req.body ?? {};
    const { id, first_name, last_name, username, photo_url, auth_date } = payload;

    if (!id || !auth_date) {
      res.status(400).json({ error: "id and auth_date are required" });
      return;
    }

    const ageSeconds = Math.floor(Date.now() / 1000) - Number(auth_date);
    if (ageSeconds < 0 || ageSeconds > MAX_AGE_S) {
      res.status(401).json({ error: "auth_date_expired" });
      return;
    }

    if (!verifyTelegramHmac(payload)) {
      res.status(401).json({ error: "invalid_telegram_hmac" });
      return;
    }

    res.json({
      ok: true,
      telegram: {
        id,
        first_name: first_name ?? null,
        last_name: last_name ?? null,
        username: username ?? null,
        photo_url: photo_url ?? null,
        auth_date,
      },
      suggested_identity_traits: {
        telegram_id: String(id),
        name: { first: first_name ?? null, last: last_name ?? null },
        username: username ?? null,
      },
    });
  },
);

app.listen(PORT, () => {
  console.log(`Telegram Login bridge listening on port ${PORT}`);
});
