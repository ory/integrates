# Duo Security

> **Maintained by:** Community contributors

[Duo Security](https://duo.com) (a Cisco company) is a market-leading enterprise MFA platform with strong push and passcode flows. This integration sends a Duo push challenge from an Ory Action webhook on login, polls Duo for the user's response, and returns the verdict so Ory can step up authentication or fail the flow.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrates-with/mfa/duo-security](https://www.ory.com/docs/integrates-with/mfa/duo-security)

## Use case

An enterprise has already standardized its workforce on Duo Mobile for MFA and wants to reuse that enrollment from Ory-hosted login flows without re-enrolling users in Ory's native TOTP/WebAuthn. The integration runs Duo's push challenge inline with Ory login; if the user approves on their device, Ory issues the session, otherwise the flow fails.

## How it works

1. A user submits credentials in the Ory UI.
2. Ory fires the sync post-login Action webhook to this handler. The handler verifies the shared secret.
3. The handler signs a Duo Auth API request with HMAC-SHA1 over a canonicalized request line and POSTs to `/auth/v2/auth` with `factor=push`, `async=1`, and the user's `duo_username` (defaults to identity email — override per identity by mapping a `traits.duo_username` field).
4. Duo returns a `txid`. The handler long-polls `/auth/v2/auth_status?txid=...` (each call blocks server-side for up to ~30 s) until the user responds or `DUO_POLL_DEADLINE_SECONDS` (default 45 s) elapses.
5. The handler returns `{ result, mfa_passed }`. Ory's response-parse Jsonnet consumes the verdict and gates the flow.

## Prerequisites

- An Ory Network project.
- Access to the Duo Admin Panel to create an **Auth API** application — get `DUO_API_HOST`, `DUO_INTEGRATION_KEY`, `DUO_SECRET_KEY`.
- Users already enrolled in Duo (this handler does **not** enroll users).
- A `duo_username` per Ory identity — either fall back to `email` (default in [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet)) or store a vendor-specific username in `identity.traits.duo_username`.
- A deployment target for the webhook handler (any Node.js runtime: Cloud Run, Heroku, Vercel, Lambda behind API Gateway, your own VM).

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill ORY_WEBHOOK_SECRET, DUO_API_HOST, DUO_INTEGRATION_KEY, DUO_SECRET_KEY,
# and (optionally) DUO_POLL_DEADLINE_SECONDS.
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /duo/challenge` — Ory Action target.

## Configure Ory

1. In the Ory Console, configure the Action hook using the snippet in [`ory-actions.yaml`](ory-actions.yaml) — register it on the **after** stage of your login flow.
2. The body template is [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet). The default falls back to `email` as the Duo username; adjust the schema and Jsonnet if Duo uses a different identifier in your org.
3. Keep `response.parse: true` and `response.ignore: false` so Ory consumes `mfa_passed` and gates the flow.
4. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value declared in the hook config.
5. Make sure Ory's webhook total timeout is ≥ `DUO_POLL_DEADLINE_SECONDS` + headroom; the long-poll is intentionally slow.

Duo Auth API onboarding, ipaddr/risk signal extensions, and step-up enforcement strategies: see the [docs page](https://ory.com/docs/integrates-with/mfa/duo-security).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match `X-Webhook-Secret` in the Ory hook config.
- **`401` from Duo with `Invalid signature`** — clock drift between the handler and Duo > 30 s. Run NTP on the handler host.
- **`User does not exist` from Duo** — `duo_username` doesn't match a Duo user. Confirm the trait mapping matches what's enrolled in Duo.
- **Push never arrives** — confirm the user has the Duo Mobile app installed and push notifications are enabled. Try sending a test push from the Duo Admin Panel.
- **`502 duo_status_failed`** — long-poll connectivity issue (egress blocked, DNS, allowlist). Duo's IP allowlist is per-customer; egress to `api-XXXXXXXX.duosecurity.com` from the handler's network is required.
- **`result: "waiting"` returned to Ory** — the user didn't respond before `DUO_POLL_DEADLINE_SECONDS`. Bump the deadline (within Duo's ~60 s push-session limit) or fail-closed on `waiting` in your response-parse Jsonnet.

## License

Apache-2.0. SPDX header at the top of each source file.
