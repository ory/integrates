# Castle.io

> **Maintained by:** Community contributors

Castle.io is an adaptive risk-scoring platform that evaluates device fingerprints, IP reputation, and behavioral signals to produce a real-time risk score and recommended action for each authentication event. This integration runs Castle inline with Ory login and registration flows so high-risk events can trigger MFA step-up or be blocked outright.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrates-with/fraud-bot-protection/castle](https://www.ory.com/docs/integrates-with/fraud-bot-protection/castle)

## Use case

A B2C product wants to keep credential-stuffing and account-takeover attempts out of its login flow without blocking legitimate users behind a CAPTCHA. Castle scores each login in real time; the integration applies an `allow` / `challenge` / `deny` decision before the session is issued, with challenge events flagged for MFA step-up in the client.

## How it works

1. The browser collects a Castle device fingerprint (`castle.js` SDK) and submits it via Ory's `transient_payload.castle_request_token` on the login or registration flow.
2. Ory authenticates the request, then fires the post-login (or post-registration) Action webhook to this handler.
3. The handler verifies the shared secret, builds a Castle Risk API request from the identity and request context, and calls Castle.
4. Castle returns a risk score (0.0–1.0) and a policy action (`allow` / `challenge` / `deny`).
5. The handler translates the response into Ory's response shape: deny → `400` with a flow message; challenge → `200` with `metadata_public.requires_mfa_stepup=true`; allow → `200` with the score recorded in metadata. Castle outages fall open (`200`, empty body) so authentication is never blocked by Castle availability.

## Prerequisites

- An Ory Network project (a free dev project is fine for testing).
- A Castle account with API access ([dashboard.castle.io/signup](https://dashboard.castle.io/signup)).
- The Castle **API Secret** (server-side, used by the handler) and **Publishable API Key** (client-side, used by `castle.js`).
- A deployment target for the webhook handler (any Node.js runtime: Cloud Run, Heroku, Vercel, Lambda behind API Gateway, your own VM).

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill in ORY_WEBHOOK_SECRET and CASTLE_API_SECRET (and optionally tune thresholds)
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /castle/login` — Ory post-login Action target.
- `POST /castle/registration` — Ory post-registration Action target.

## Configure Ory

1. In the Ory Console, configure two Action hooks using the snippets in [`ory-actions.yaml`](ory-actions.yaml) (post-login and post-registration).
2. The body templates are [`jsonnet/login.jsonnet`](jsonnet/login.jsonnet) and [`jsonnet/registration.jsonnet`](jsonnet/registration.jsonnet).
3. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value declared in the hook config.
4. Embed `castle.js` in your login/registration UI and pass the device token via `transient_payload.castle_request_token`. See the [docs page](https://ory.com/docs/integrates-with/fraud-bot-protection/castle) for client-side examples.

Detailed setup with screenshots, threshold tuning guidance, and Castle dashboard wiring: see the docs page.

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match the `X-Webhook-Secret` value in the Ory hook config.
- **Logins always allow regardless of risk** — Castle is throwing and the handler is failing open. Check handler logs for `Castle API ...` errors and verify `CASTLE_API_SECRET` is correct.
- **`400 Login blocked`** for low-risk users — `CASTLE_DENY_THRESHOLD` is too aggressive, or your Castle policy is returning `deny` for routine traffic. Review the policy in the Castle dashboard.
- **Risk score shows as `0` for every event** — `castle.js` isn't loaded or `transient_payload.castle_request_token` isn't being set. Without the device token, Castle scores on IP and headers only.

## License

Apache-2.0. SPDX header at the top of each source file.
