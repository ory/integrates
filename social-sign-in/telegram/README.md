# Telegram Login

> **Maintained by:** Community contributors

[Telegram Login](https://core.telegram.org/bots/telegram-login) supports the OpenID Connect authorization code flow, so you can connect it directly to Ory as a [generic provider](https://www.ory.com/docs/kratos/social-signin/generic) with no code. This directory also contains a validator for the [legacy Login Widget](https://core.telegram.org/widgets/login-legacy), which posts an HMAC-SHA256-signed payload instead of returning an authorization code.

**Type:** config (generic OIDC provider), plus an optional webhook for the legacy widget
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/telegram](https://www.ory.com/docs/integrates-with/social-sign-in/telegram)

## Configure Telegram OpenID Connect (recommended)

1. Create or select a bot in [@BotFather](https://t.me/botfather). Open **Login Widget** and obtain the Client ID and Client Secret.
2. Add a generic social sign-in provider to Ory:

   ```yaml
   id: telegram
   provider: generic
   client_id: "<telegram-client-id>"
   client_secret: "<telegram-client-secret>"
   issuer_url: https://oauth.telegram.org
   claims_source: id_token
   pkce: force
   mapper_url: base64://<base64-encoded-jsonnet>
   scope:
     - openid
     - profile
   ```

3. Add Ory's redirect URI to the bot's **Allowed URLs**. With `pkce: force`, it is `https://$PROJECT_SLUG.projects.oryapis.com/self-service/methods/oidc/callback`. Use your project's custom domain if configured.
4. Map the claims in Jsonnet. Telegram supplies `sub`, plus profile claims such as `name`, `preferred_username`, and `picture`. Keep `claims_source: id_token`: Telegram has no UserInfo endpoint. Telegram doesn't provide an email address, so collect it separately if your schema requires one. To request a phone number with the user's consent, add the `phone` scope and map `phone_number`.

## Legacy widget validator

If you keep the legacy widget, its payload `{ id, first_name, last_name, username, photo_url, auth_date, hash }` must be verified before you trust it. The handler in `webhook/` does that: it checks `X-Webhook-Secret`, recomputes the HMAC-SHA256 over the sorted data-check-string with key `SHA256(bot_token)`, compares it in constant time, and rejects stale `auth_date` values.

To turn a verified payload into an Ory sign-in, run an OIDC bridge whose login page embeds the widget, calls this validator, and completes OIDC with the Telegram user ID as `sub`. For example, an Ory Hydra Authorization [login app](https://www.ory.com/docs/oauth2-oidc/custom-login-consent/flow) can accept the login request with that subject. Configure the bridge in Ory as a generic provider using the bridge's issuer URL. Ory doesn't provide this bridge: you build and operate it.

## Prerequisites

- A Telegram bot created via [@BotFather](https://t.me/botfather) — note the bot token.
- A registered domain for the Login Widget (set via `/setdomain` in BotFather).
- An OIDC bridge that calls the validator (the validator itself does not call Ory).
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

## Wire the validator

The validator runs **outside** the Ory Action webhook path: Telegram widget → your bridge's login page → validator → your bridge → Ory. There is no Ory Action hook to register.

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` doesn't match the value your application sends on `X-Webhook-Secret`.
- **`401 invalid_telegram_hmac`** — bot token mismatch, payload tampering, or your application re-serialized number fields. The HMAC is computed over the original string representations from the widget; don't `JSON.parse` then re-stringify before forwarding.
- **`401 auth_date_expired`** — payload is older than `TELEGRAM_AUTH_MAX_AGE_SECONDS` (default 24h). Either tighten the window or refresh the user's login flow.
- **Widget never posts** — `setdomain` not configured for the bot, or the page is loading the widget over a domain that doesn't match.

## License

Apache-2.0. SPDX header at the top of each source file.
