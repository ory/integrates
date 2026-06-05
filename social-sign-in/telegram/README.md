# Telegram Login

> **Maintained by:** Community contributors

[Telegram](https://core.telegram.org/widgets/login) does not implement OAuth 2.0 or OIDC. It provides a **Login Widget** that posts an HMAC-SHA256-signed payload to a customer-provided URL. This integration is a small bridge that validates the HMAC against the Telegram bot token and returns the verified profile so applications can call the Ory Admin API to upsert the matching identity and issue a session.

**Type:** webhook (HTTP bridge called by your application)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/telegram](https://www.ory.com/docs/integrates-with/social-sign-in/telegram)

## Use case

A consumer app wants Telegram as a sign-in option but Telegram has no OIDC, so Ory's native social-sign-in providers don't apply. The bridge validates the Login Widget HMAC inline, returns the verified profile, and the application uses Ory's Admin API to upsert the identity and start a session.

## How it works

1. The browser loads the Telegram Login Widget and the user taps "Log in with Telegram".
2. Telegram returns a payload `{ id, first_name, last_name, username, photo_url, auth_date, hash }` to your application's callback.
3. Your application forwards the payload to this bridge: `POST /telegram/validate` with `X-Webhook-Secret`.
4. The bridge verifies `X-Webhook-Secret`, recomputes the HMAC-SHA256 over the sorted data-check-string with key `SHA256(bot_token)`, and rejects expired `auth_date`.
5. The bridge returns the verified profile + `suggested_identity_traits` so your application can call Ory Admin API `PUT /admin/identities` and bootstrap a session.

## Prerequisites

- A Telegram bot created via [@BotFather](https://t.me/botfather) — note the bot token.
- A registered domain for the Login Widget (set via `/setdomain` in BotFather).
- An Ory Network project + admin API access (your application uses this; the bridge itself does not call Ory).
- A deployment target for the handler.

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill ORY_WEBHOOK_SECRET, TELEGRAM_BOT_TOKEN, (optional) TELEGRAM_AUTH_MAX_AGE_SECONDS.
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /telegram/validate` — bridge endpoint your application calls with the widget payload.

## Configure Ory

This integration runs **outside** the Ory Action webhook path; Telegram → your app → bridge → your app → Ory Admin API. There is no Ory Action hook to register — your application calls the bridge directly.

Embedding the Login Widget, identity-schema fields for Telegram traits, and session-bootstrap patterns: see the [docs page](https://ory.com/docs/integrates-with/social-sign-in/telegram).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` doesn't match the value your application sends on `X-Webhook-Secret`.
- **`401 invalid_telegram_hmac`** — bot token mismatch, payload tampering, or your application re-serialized number fields. The HMAC is computed over the original string representations from the widget; don't `JSON.parse` then re-stringify before forwarding.
- **`401 auth_date_expired`** — payload is older than `TELEGRAM_AUTH_MAX_AGE_SECONDS` (default 24h). Either tighten the window or refresh the user's login flow.
- **Widget never posts** — `setdomain` not configured for the bot, or the page is loading the widget over a domain that doesn't match.

## License

Apache-2.0. SPDX header at the top of each source file.
