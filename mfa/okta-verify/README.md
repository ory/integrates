# Okta Verify

> **Maintained by:** Community contributors

[Okta Verify](https://www.okta.com/products/multi-factor-authentication/) is Okta's first-party MFA app supporting push notifications and TOTP. This integration sends an Okta Verify push from an Ory Action webhook on login, polls Okta for the user's response, and returns the verdict so Ory can step up authentication or fail the flow.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrations/mfa/okta-verify](https://ory.com/docs/integrations/mfa/okta-verify)

## Use case

An enterprise has already standardized its workforce on Okta Verify for MFA and wants to reuse that factor enrollment from Ory-hosted login flows without re-enrolling users in Ory's native TOTP/WebAuthn. The integration runs the Okta Verify push inline with Ory login and relays the verdict so Ory issues the session only on approval.

## How it works

1. A user submits credentials in the Ory UI.
2. Ory fires the sync post-login Action webhook to this handler. The handler verifies the shared secret.
3. The handler calls `GET /api/v1/users/{user_id}/factors` and finds the active `push` factor on the Okta user.
4. The handler `POST`s `/api/v1/users/{user_id}/factors/{factor_id}/verify` to send the push. Okta returns immediately with `factorResult: WAITING` and a `_links.poll.href`.
5. The handler polls the poll URL every 2 s until `factorResult` becomes `SUCCESS`/`REJECTED`/`TIMEOUT` or `OKTA_POLL_DEADLINE_SECONDS` elapses.
6. The handler returns `{ result, mfa_passed }` to Ory; Ory's response-parse Jsonnet gates the flow on `mfa_passed`.

## Prerequisites

- An Ory Network project.
- An Okta org URL (`https://your-org.okta.com`).
- An Okta API token (SSWS) with permission to read user factors and call factor verify (Okta admin → Security → API → Tokens).
- Users already enrolled in Okta Verify (or any active `push` factor on Okta).
- An `okta_user_id` per Ory identity (typically populated when the user federates from Okta or set by a provisioning flow).
- A deployment target for the webhook handler.

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill ORY_WEBHOOK_SECRET, OKTA_ORG_URL, OKTA_API_TOKEN,
# and (optionally) OKTA_POLL_DEADLINE_SECONDS.
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /okta-verify/challenge` — Ory Action target.

## Configure Ory

1. Configure the Action hook using the snippet in [`ory-actions.yaml`](ory-actions.yaml) — register on `after:login`.
2. The body template is [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet). Carry `okta_user_id` in `identity.traits` (or in `metadata_admin` if you don't want to expose it).
3. Keep `response.parse: true` and `response.ignore: false` so Ory consumes `mfa_passed`.
4. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value in the hook config.
5. Make sure Ory's webhook total timeout is ≥ `OKTA_POLL_DEADLINE_SECONDS` + headroom.

Token rotation, fallback factor flows, and "no factor enrolled" branching: see the [docs page](https://ory.com/docs/integrations/mfa/okta-verify).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match `X-Webhook-Secret` in the Ory hook config.
- **`401 Unauthorized` from Okta** — SSWS token revoked, expired, or scoped to the wrong org. Confirm the token's permissions in the Okta admin.
- **`404` on user factor lookup** — `okta_user_id` is wrong or the Okta user was deleted. The Ory↔Okta mapping isn't current.
- **`mfa_passed: false, reason: "no_push_factor_enrolled"`** — the user has no active `push` factor. Either enroll the user in Okta Verify first or branch to a fallback factor in Ory.
- **`REJECTED` even on tap-Approve** — a stale push remained active. Tighten `OKTA_POLL_DEADLINE_SECONDS` so a stale challenge doesn't dominate the response.

## License

Apache-2.0. SPDX header at the top of each source file.
