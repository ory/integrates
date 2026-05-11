# Telegram Login — Ory Network Integration

> **Maintained by:** Community contributors

## Overview

Telegram does not implement OAuth 2.0 or OIDC. It provides a **Login Widget** that is embedded in your application and posts an HMAC-SHA256-signed payload to a callback URL. This integration is a small bridge that:

1. Validates the HMAC signature against the Telegram bot token.
2. Returns the verified profile to your application.

Your application then calls the **Ory Admin API** to upsert an identity matching `telegram_id` and start an Ory session. There is no native Kratos provider for Telegram — this is the simplest viable path until Telegram (or Ory) ships standard federation.

## How it works

```
Your web app embeds the Telegram Login Widget
        ↓
User taps "Log in with Telegram" → Telegram redirect / postMessage
        ↓
Telegram posts widget data (hash-signed)
  { id, first_name, last_name, username, photo_url, auth_date, hash }
        ↓
Your app forwards to this handler:
  POST /telegram/validate   (X-Webhook-Secret)
        ↓
Handler verifies the HMAC against SHA256(bot_token)
Handler enforces auth_date freshness
        ↓
Handler returns:
  { ok: true,
    telegram: { id, first_name, last_name, username, photo_url, auth_date },
    suggested_identity_traits: { telegram_id, name, username } }
        ↓
Your app calls Ory Admin API:
  PUT /admin/identities  (or PATCH by external id)
        ↓
Your app starts an Ory session for the upserted identity
```

## Prerequisites

- A **Telegram bot** created via [@BotFather](https://t.me/botfather) — note the **bot token**
- A **registered domain** for the Login Widget (set via `/setdomain` to BotFather)
- Ory Network project + Admin API access (the customer's app calls this; the handler does not)
- A deployment target for the handler

## Deploy

```bash
cd webhook/
cp .env.example .env
# Fill TELEGRAM_BOT_TOKEN, ORY_WEBHOOK_SECRET, TELEGRAM_AUTH_MAX_AGE_SECONDS
npm install
node server.js
```

Endpoints:

- `GET /health` — readiness check
- `POST /telegram/validate` — your application calls this with the widget payload

## Embedding the widget

In your web app:

```html
<script async src="https://telegram.org/js/telegram-widget.js?22"
        data-telegram-login="YOUR_BOT_USERNAME"
        data-size="large"
        data-onauth="onTelegramAuth(user)"
        data-request-access="write"></script>

<script>
  async function onTelegramAuth(user) {
    const res = await fetch("/your-app/telegram/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(user),
    });
    if (res.ok) window.location.assign("/dashboard");
  }
</script>
```

## Server-side glue (your app, not this handler)

Inside your app's `/your-app/telegram/login` route:

```javascript
// 1. Validate via the bridge handler.
const validateRes = await fetch(`${TELEGRAM_BRIDGE_URL}/telegram/validate`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-webhook-secret": process.env.ORY_WEBHOOK_SECRET,
  },
  body: JSON.stringify(req.body),
});
if (!validateRes.ok) return res.status(401).json({ error: "telegram_validation_failed" });
const { suggested_identity_traits } = await validateRes.json();

// 2. Upsert an Ory identity keyed on telegram_id.
const upsertRes = await fetch(`${ORY_PROJECT_URL}/admin/identities`, {
  method: "PUT",
  headers: {
    authorization: `Bearer ${ORY_ADMIN_API_KEY}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    schema_id: "default",
    traits: suggested_identity_traits,
    metadata_public: { provider: "telegram" },
  }),
});
const identity = await upsertRes.json();

// 3. Start an Ory session for the identity.
//    Use whichever Kratos session-bootstrap method your project allows
//    (e.g. exchange a code via the admin API, or initialize a recovery flow).
```

(Identity schema must include `telegram_id` and the other traits the bridge returns.)

## Why not just configure Telegram as an OIDC provider?

Telegram doesn't expose `/.well-known/openid-configuration`, doesn't accept redirect URIs in the OIDC sense, and the widget data is the only authoritative signal. You can build a wrapper that fronts the widget data behind a fake OIDC endpoint, but the gain over the bridge above is small and the ongoing maintenance is non-trivial. This bridge is the pragmatic path until Telegram changes posture.

## Caveats

- **Replay window.** `auth_date` freshness is enforced via `TELEGRAM_AUTH_MAX_AGE_SECONDS`. Default is Telegram's recommended 24h. Tighten to 600s if you want stricter session creation.
- **Phone number is optional.** Users who haven't shared their phone with Telegram won't have a phone in the payload. Don't gate registration on it.
- **Domain pinning.** Telegram enforces the domain you set with BotFather; widget calls from any other origin will be silently dropped.

## Troubleshooting

- **`invalid_telegram_hmac`** — bot token mismatch, payload tampering, or a key was renamed in transit. The most common cause is JSON-serializing values that came as numbers from Telegram (e.g., `id`, `auth_date`); the HMAC is computed over the original string representations the widget produced.
- **`auth_date_expired`** — payload is older than `TELEGRAM_AUTH_MAX_AGE_SECONDS`.
- **Widget never posts** — `setdomain` not configured for the bot, or the page is loading the widget over a domain that doesn't match.

## Resources

- [Telegram Login Widget docs](https://core.telegram.org/widgets/login)
- [Telegram Login authorization checking](https://core.telegram.org/widgets/login#checking-authorization)
- [Ory Admin API — identities](https://www.ory.com/docs/reference/api#tag/identity)
