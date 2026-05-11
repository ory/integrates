# Okta Verify — Ory Network Integration

> **Maintained by:** Community contributors

## Overview

Okta Verify is Okta's first-party MFA app supporting push notifications and TOTP. This integration sends an Okta Verify push from an Ory Actions webhook on login, polls Okta for the user's response, and returns the verdict so an Ory Action can step up authentication or fail the flow.

> **When to use this.** This integration is the right choice when the customer's workforce is already enrolled in Okta Verify and you want to reuse that factor enrollment from Ory. If users are not already enrolled in Okta Verify, prefer Ory's native WebAuthn / TOTP factors.

## How it works

```
User submits credentials in Ory UI
        ↓
Ory Action webhook → POST /okta-verify/challenge
        ↓
Handler verifies X-Webhook-Secret
        ↓
Handler GETs /api/v1/users/{user_id}/factors → finds the active push factor
        ↓
Handler POSTs /api/v1/users/{user_id}/factors/{factor_id}/verify
        ↓
Okta returns { factorResult: WAITING, _links.poll }
        ↓
Handler polls _links.poll every 2s until factorResult ≠ WAITING (or deadline)
        ↓
Handler returns { mfa_passed: result === "SUCCESS", result }
        ↓
Ory Action: continues on mfa_passed=true, fails otherwise
```

## Prerequisites

- Ory Network project
- Okta org URL (e.g. `https://your-org.okta.com`)
- Okta API token (SSWS) with permission to read user factors and call factor verify — generate under **Security → API → Tokens**
- Users must already have an active Okta Verify (or other push) factor enrolled
- An `okta_user_id` per identity stored in `identity.traits.okta_user_id` — typically populated when the user federates from Okta into Ory or set by a separate provisioning flow
- A deployment target

## Deploy

```bash
cd webhook/
cp .env.example .env
# Fill OKTA_ORG_URL, OKTA_API_TOKEN, OKTA_POLL_DEADLINE_SECONDS, ORY_WEBHOOK_SECRET
npm install
node server.js
```

Endpoints:

- `GET /health` — readiness check
- `POST /okta-verify/challenge` — Ory Action target

## Configure Ory

1. Register the webhook on the **after** stage of your login flow with [`ory-actions.yaml`](ory-actions.yaml).
2. Identity schema must include `okta_user_id` (string) — the Okta user ID owning the factor. The default jsonnet body sends `null` if not present, which causes the handler to return `mfa_passed: false` with `reason: "no_push_factor_enrolled"`.
3. Set `response.parse: true` and `response.ignore: false`.

## Behavior notes

- **Polling, not long-polling.** Okta's verify endpoint returns immediately with `WAITING` and a poll URL. The handler polls every 2 seconds until `OKTA_POLL_DEADLINE_SECONDS` elapses. Ory's webhook total timeout must accommodate the deadline.
- **No factor enrolled.** If the user has no active push factor, the handler returns `mfa_passed: false, reason: "no_push_factor_enrolled"` rather than 4xx — let the Ory Action decide whether that's a hard fail or a fall-through to TOTP.
- **Token rotation.** SSWS tokens expire on a schedule (or when the issuing admin's role changes). Production deployments should monitor `401` rates and rotate proactively.

## Troubleshooting

- **`401 Unauthorized`** — SSWS token revoked, expired, or scoped to the wrong org. Confirm the token's permissions in the Okta admin.
- **`404` on the user factor lookup** — `okta_user_id` is wrong or the user was deleted. Don't assume the Ory identity mapping is current.
- **`REJECTED` even on tap-Approve** — sometimes a stale push remains active. Tighten the poll deadline so a stale challenge doesn't dominate the response.

## Resources

- [Okta Factors API — verify factor](https://developer.okta.com/docs/reference/api/factors/#verify-factor)
- [Okta Factors API — list user factors](https://developer.okta.com/docs/reference/api/factors/#list-enrolled-factors)
- [Ory Actions and webhooks](https://www.ory.com/docs/actions/web-hook)
