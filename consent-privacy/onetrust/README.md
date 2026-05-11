# OneTrust

> **Maintained by:** Community contributors

[OneTrust](https://onetrust.com) is a privacy, security, and governance platform for managing consent, fulfilling Data Subject Requests (DSRs), and maintaining compliance with GDPR, CCPA, LGPD, and PIPA. This integration writes a consent receipt to OneTrust on every registration and exposes a DSR callback endpoint that lets OneTrust's Privacy Rights Automation workflow delete, export, or rectify identities in Ory.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrations/consent-privacy/onetrust](https://ory.com/docs/integrations/consent-privacy/onetrust)

## Use case

A regulated B2C product needs a defensible audit trail of consent (marketing, analytics, personalization) for every signup, plus a single button in the OneTrust UI that fulfills a deletion or export request across all downstream systems including the identity store. This integration writes a consent receipt to OneTrust at registration time and gives OneTrust a webhook callback to act on the Ory identity when a DSR is approved.

## How it works

1. The browser collects consent choices and submits them via Ory's `transient_payload.consent` (e.g. `{"marketing":true,"analytics":false}`).
2. Ory fires the sync post-registration Action webhook. The handler verifies the shared secret.
3. The handler immediately returns `200` with `identity.metadata_public.consent` set, so Ory records the consent on the new identity even if OneTrust is unreachable.
4. After the response is flushed, the handler exchanges its OneTrust OAuth2 client credentials for an access token (cached in memory) and POSTs a consent receipt to `POST /api/consentmanager/v2/consent-receipts`, mapping each consent category key to the configured OneTrust Purpose ID.
5. Separately, when a DSR is approved in OneTrust, OneTrust's Privacy Rights workflow calls `POST /onetrust/dsr` on this handler with `X-OneTrust-Secret`. The handler looks up the identity by email and runs the requested action (`DELETE`/`ERASURE`, `EXPORT`/`ACCESS`, or `RECTIFICATION`) against Ory's Admin API.

## Prerequisites

- An Ory Network project and an admin API key with identity read/write/delete scope (Ory Console → API Keys).
- A OneTrust tenant with the Consent & Preferences and Privacy Rights Automation modules.
- OneTrust OAuth2 client credentials (OneTrust Admin → Profile → Credentials).
- A deployment target for the webhook handler (any Node.js runtime: Cloud Run, Heroku, Vercel, Lambda behind API Gateway, your own VM).

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill in ORY_WEBHOOK_SECRET, ONETRUST_DSR_SECRET, ONETRUST_CLIENT_ID/SECRET,
# ONETRUST_PURPOSE_* IDs, ORY_SDK_URL, ORY_ADMIN_API_KEY.
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /onetrust/registration` — Ory sync post-registration Action target.
- `POST /onetrust/dsr` — OneTrust DSR callback (gated by `X-OneTrust-Secret`).

## Configure Ory

1. In the Ory Console, configure the Action hook using the snippet in [`ory-actions.yaml`](ory-actions.yaml).
2. The body template is [`jsonnet/registration.jsonnet`](jsonnet/registration.jsonnet).
3. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value declared in the hook config.
4. In OneTrust's Privacy Rights Automation workflow, add a webhook step pointing at `https://your-handler.example.com/onetrust/dsr` with `X-OneTrust-Secret: <value of ONETRUST_DSR_SECRET>`.

Identity-schema consent fields, OneTrust Purpose ID mapping, and DSR workflow wiring: see the [docs page](https://ory.com/docs/integrations/consent-privacy/onetrust).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match `X-Webhook-Secret` in the Ory hook config.
- **`401 invalid onetrust secret`** — the OneTrust DSR workflow isn't sending the expected `X-OneTrust-Secret` header.
- **`OneTrust OAuth 401`** in handler logs — `ONETRUST_CLIENT_ID`/`ONETRUST_CLIENT_SECRET` are wrong, or the credentials don't have the `consent` scope.
- **`OneTrust OAuth 400 invalid_grant`** — usually a `grant_type` mismatch; the client must be configured for `client_credentials` in OneTrust admin.
- **No purposes appear on the consent receipt** — `ONETRUST_PURPOSE_*` env vars aren't set for the consent keys the client is sending. The handler skips unmapped categories silently.
- **DSR returns `identity_not_found`** — the email in OneTrust's request doesn't match the Ory credential identifier.

## License

Apache-2.0. SPDX header at the top of each source file.
