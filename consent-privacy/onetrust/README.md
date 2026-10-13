# OneTrust

> **Maintained by:** Community contributors

[OneTrust](https://onetrust.com) is a privacy, security, and governance platform for managing consent, fulfilling Data Subject Requests (DSRs), and maintaining compliance with GDPR, CCPA, LGPD, and PIPA. This integration stores consent choices on the Ory identity at registration, writes a consent receipt keyed by the Ory identity ID to OneTrust, and exposes a DSR callback endpoint that lets OneTrust's Privacy Rights Automation workflow delete, export, or rectify identities in Ory.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrates-with/consent-privacy/onetrust](https://www.ory.com/docs/integrates-with/consent-privacy/onetrust)

## Use case

A regulated B2C product needs a defensible audit trail of consent (marketing, analytics, personalization) for every signup, plus a single button in the OneTrust UI that fulfills a deletion or export request across all downstream systems including the identity store. This integration writes a consent receipt to OneTrust at registration time and gives OneTrust a webhook callback to act on the Ory identity when a DSR is approved.

## How it works

1. The browser collects consent choices and submits them in the registration flow's `transient_payload.consent`, for example `{"marketing":true,"analytics":false}`.
2. The first Ory Action (`response.parse: true`) calls `POST /onetrust/registration` before Ory saves the identity. The handler verifies the shared secret and returns `identity.metadata_public.consent`, merged with the metadata the request carried, so Ory stores the choices on the new identity. The identity has no ID yet (`00000000-0000-0000-0000-000000000000`), so this route doesn't call OneTrust. Invalid or missing consent returns `200` with no changes, so registration is never blocked.
3. The second Ory Action (`response.ignore: true`) calls `POST /onetrust/receipt` after Ory saves the identity. The handler exchanges its OneTrust OAuth2 client credentials for an access token (cached in memory) and POSTs a consent receipt to `POST /api/consentmanager/v2/consent-receipts`, keyed by the Ory identity ID and mapping each consent category to the configured OneTrust Purpose ID. A failed OneTrust call returns `502`, which Ory retries up to three attempts in total.
4. When a DSR is approved in OneTrust, the Privacy Rights workflow calls `POST /onetrust/dsr` with `X-OneTrust-Secret` and the stored Ory identity ID in `oryIdentityId` (or `dataSubject.oryIdentityId`). The handler reads the identity with `GET /admin/identities/{id}` and runs the requested action (`DELETE`/`ERASURE`, `EXPORT`/`ACCESS`, or `RECTIFICATION`) against Ory's Admin API. Rectification applies `dataSubject.corrections` as a JSON Patch on the identity's traits.

The DSR route doesn't look identities up by email: an email trait isn't necessarily a credential identifier, for example for social sign-in. Use the Ory identity ID recorded on the consent receipt. For older receipts without an identity ID, establish a verified mapping before processing the request.

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
- `POST /onetrust/registration` — Ory Action target (`response.parse: true`), returns the consent metadata.
- `POST /onetrust/receipt` — Ory Action target (`response.ignore: true`), records the OneTrust consent receipt.
- `POST /onetrust/dsr` — OneTrust DSR callback (gated by `X-OneTrust-Secret`).

## Configure Ory

1. Add both Action hooks from [`ory-actions.yaml`](ory-actions.yaml) to `selfservice.flows.registration.after.password.hooks`, and to the list of every other sign-up method you enable, such as `oidc`, `code`, or `passkey`. Keep `session` last in each list. Don't use the flow-level `registration.after.hooks` list: Ory runs it only for methods without hooks of their own. See [Attach `after` actions to authentication methods](https://www.ory.com/docs/kratos/hooks/configure-hooks#attach-after-actions-to-authentication-methods).
2. Both actions use the body template [`jsonnet/registration.jsonnet`](jsonnet/registration.jsonnet). Encode it with `base64 < jsonnet/registration.jsonnet | tr -d '\n'` and set `body: base64://<encoded>`. Ory Network doesn't accept `file://` URLs.
3. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value declared in the hook config.
4. In OneTrust's Privacy Rights Automation workflow, add a webhook step pointing at `https://your-handler.example.com/onetrust/dsr` with `X-OneTrust-Secret: <value of ONETRUST_DSR_SECRET>` and a JSON body that contains `requestType` and `oryIdentityId`.

Identity-schema consent fields, OneTrust Purpose ID mapping, and DSR workflow wiring: see the [docs page](https://www.ory.com/docs/integrates-with/consent-privacy/onetrust).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match `X-Webhook-Secret` in the Ory hook config.
- **`401 invalid onetrust secret`** — the OneTrust DSR workflow isn't sending the expected `X-OneTrust-Secret` header.
- **`OneTrust OAuth 401`** in handler logs — `ONETRUST_CLIENT_ID`/`ONETRUST_CLIENT_SECRET` are wrong, or the credentials don't have the `consent` scope.
- **`OneTrust OAuth 400 invalid_grant`** — usually a `grant_type` mismatch; the client must be configured for `client_credentials` in OneTrust admin.
- **No purposes appear on the consent receipt** — `ONETRUST_PURPOSE_*` env vars aren't set for the consent keys the client is sending. The handler skips unmapped categories silently.
- **DSR returns `oryIdentityId required`** — the OneTrust workflow didn't send the Ory identity ID.
- **DSR returns `identity_not_found`** — no identity exists with that ID, for example because it was already deleted.
- **Registration fails with a webhook error** — the body template failed or the handler returned a `4xx` without the `messages` shape. Check the handler logs and the Ory project logs.

## License

Apache-2.0. SPDX header at the top of each source file.
