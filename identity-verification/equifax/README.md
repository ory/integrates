# Equifax

> **Maintained by:** Community contributors

[Equifax](https://www.equifax.com) is a global credit bureau that provides credit-anchored identity verification through its Digital Identity Trust APIs. This integration calls Equifax from an Ory Action webhook during registration to verify the user's identity attributes against credit-bureau data and returns a decision plus trust score so Ory's post-flow Action can gate the flow.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrations/identity-verification/equifax](https://ory.com/docs/integrations/identity-verification/equifax)

## Use case

A regulated B2C product (fintech, lending, insurance) needs credit-anchored identity proofing on every signup to satisfy KYC requirements. Equifax's Digital Identity Trust APIs return a deterministic decision and a confidence score; the integration runs this lookup inline with Ory registration so high-confidence identities pass through and low-confidence ones can be blocked or routed to step-up verification.

## How it works

1. A user completes the registration form, providing the identity attributes Equifax needs (first name, last name, date of birth, optional SSN last 4, address).
2. Ory fires the sync post-registration Action webhook to this handler. The handler verifies the shared secret.
3. The handler exchanges its Equifax OAuth2 client credentials for an access token using the configured `EQUIFAX_SCOPE` and caches it (refresh ~5 minutes before expiry to amortize the round-trip).
4. The handler calls Equifax's identity-verification endpoint with the consumer payload built from the identity traits.
5. The handler echoes Equifax's `decision`/`outcome`, `trust_score`, and `reference_id` back to Ory. Ory's Action consumes the response and applies your policy (allow, block, route to step-up).

## Prerequisites

- An Ory Network project.
- An Equifax developer account at [developer.equifax.com](https://developer.equifax.com) with an entitled product (Identity Verification, Digital Identity Trust, etc.) — Equifax onboarding is gated and requires legal review.
- OAuth2 client credentials (`client_id`, `client_secret`) and the product `scope`.
- A deployment target for the webhook handler (any Node.js runtime: Cloud Run, Heroku, Vercel, Lambda behind API Gateway, your own VM).

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill ORY_WEBHOOK_SECRET, EQUIFAX_API_BASE, EQUIFAX_CLIENT_ID,
# EQUIFAX_CLIENT_SECRET, EQUIFAX_SCOPE.
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /equifax/verify-identity` — Ory Action target.

## Configure Ory

1. In the Ory Console, configure the Action hook using the snippet in [`ory-actions.yaml`](ory-actions.yaml).
2. The body template is [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet) — Equifax verification typically needs `first_name`, `last_name`, `date_of_birth`, `ssn_last_four`, and `address`. Extend the identity schema to carry those fields if they aren't already present.
3. Keep `response.parse: true` and `response.ignore: false` so Ory consumes Equifax's verdict.
4. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value declared in the hook config.

Detailed setup, identity-schema extensions for KYC fields, and per-product Equifax scopes: see the [docs page](https://ory.com/docs/integrations/identity-verification/equifax).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match the `X-Webhook-Secret` value in the Ory hook config.
- **`equifax token 401`** — the `EQUIFAX_SCOPE` doesn't match the product you've been entitled to in the Equifax developer portal. The scope is product-specific.
- **Sandbox vs production** — sandbox uses `https://api.sandbox.equifax.com`; production uses `https://api.equifax.com`. Mixing credentials and base URLs returns `401`.
- **`502 verify_failed`** — Equifax API returned non-2xx. Check handler logs for the response body; common causes are malformed `consumer` payload (missing required fields) or product entitlement issues.
- **PII in logs** — Equifax responses can include sensitive matched attributes. Strip them from logs before shipping to your SIEM.

## License

Apache-2.0. SPDX header at the top of each source file.
