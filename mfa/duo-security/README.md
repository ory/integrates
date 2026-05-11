# Duo Security — Ory Network Integration

> **Maintained by:** Community contributors

## Overview

Duo Security (a Cisco company) is a market-leading enterprise MFA platform with strong push and passcode flows. This integration sends a Duo push challenge from an Ory Actions webhook on login, polls Duo for the user's response, and returns the verdict so an Ory Action can step up authentication or fail the flow.

> **Why this exists.** Ory Network supports TOTP, WebAuthn/FIDO2, and lookup secrets natively. Duo push is layered on top via this webhook for organizations that have already standardized their workforce on Duo and want to reuse that enrollment from Ory.

## How it works

```
User submits credentials in Ory UI
        ↓
Ory Action webhook → POST /duo/challenge
        ↓
Handler verifies X-Webhook-Secret
        ↓
Handler signs and POSTs /auth/v2/auth (factor=push, async=1) to Duo
        ↓
Duo returns { txid }
        ↓
Handler long-polls /auth/v2/auth_status?txid=... until result ≠ waiting
        ↓
Handler returns { mfa_passed: true|false, result: "allow"|"deny"|"waiting" }
        ↓
Ory Action: continues the login on `mfa_passed=true`, fails it otherwise
```

## Prerequisites

- Ory Network project
- Duo Admin Panel access — create an **Auth API** application to get `DUO_API_HOST`, `DUO_INTEGRATION_KEY`, `DUO_SECRET_KEY`
- Users must already be enrolled in Duo (this handler does **not** enroll users)
- A `duo_username` per identity. Either map it from `email` (default in [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet)) or store the Duo-side username in `identity.traits.duo_username`
- A deployment target

## Deploy

```bash
cd webhook/
cp .env.example .env
# Fill DUO_API_HOST, DUO_INTEGRATION_KEY, DUO_SECRET_KEY,
# DUO_POLL_DEADLINE_SECONDS, ORY_WEBHOOK_SECRET
npm install
node server.js
```

Endpoints:

- `GET /health` — readiness check
- `POST /duo/challenge` — Ory Action target

## Configure Ory

1. Register the webhook on the **after** stage of your login flow with [`ory-actions.yaml`](ory-actions.yaml).
2. Set `response.parse: true` and `response.ignore: false` so Ory consumes `mfa_passed` and gates the flow.
3. The default jsonnet body falls back to `email` as the Duo username — adjust the schema if Duo uses a different identifier in your org.

## Behavior notes

- **Long-poll deadline.** Duo's `/auth_status` blocks server-side until state changes (~30s) and then returns; the handler loops until the local `DUO_POLL_DEADLINE_SECONDS` elapses. Ory's webhook total timeout must be >= this deadline plus headroom.
- **Network rules.** Duo's IP allowlist is per-customer; egress to `api-XXXXXXXX.duosecurity.com` from your handler's network is required.
- **Failure modes.** If the user denies the push or the deadline elapses, `mfa_passed` is `false`. If Duo errors, the handler returns `502`; configure the Ory hook to fail-closed in that case.

## Troubleshooting

- **`401` from Duo with `Invalid signature`** — clock drift between the handler and Duo > 30s causes signature validation to fail. Run NTP.
- **`User does not exist`** — `duo_username` doesn't match a Duo user. Confirm the trait mapping in `jsonnet/identity.jsonnet` matches what's enrolled in Duo.
- **Push never arrives** — confirm the user has the Duo Mobile app installed and that push notifications are enabled on the device.

## Resources

- [Duo Auth API documentation](https://duo.com/docs/authapi)
- [Duo `/auth/v2/auth` reference](https://duo.com/docs/authapi#/auth)
- [Duo `/auth/v2/auth_status` reference](https://duo.com/docs/authapi#/auth_status)
- [Ory Actions and webhooks](https://www.ory.com/docs/actions/web-hook)
