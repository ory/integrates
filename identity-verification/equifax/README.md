# Equifax — Ory Network Integration

> **Maintained by:** Community contributors

## Overview

Equifax provides credit-anchored identity verification through its Digital Identity Trust APIs. This integration calls Equifax from an Ory Actions webhook during registration to verify identity attributes against credit-bureau data and writes the resulting trust score back into the response so Ory can gate the registration flow.

Common in onboarding for financial services, lending, and other compliance-heavy use cases.

## How it works

```
User completes registration in Ory UI
        ↓
Ory Action webhook → POST /equifax/verify-identity
        ↓
Handler authenticates the request (X-Webhook-Secret)
        ↓
Handler exchanges client credentials for an Equifax OAuth 2.0 token (cached)
        ↓
Handler calls Equifax verify endpoint with the consumer payload
        ↓
Equifax returns a decision + trust score
        ↓
Handler echoes decision back to Ory
        ↓
Ory Action consumes the response and applies your policy
```

## Prerequisites

- Ory Network project
- Equifax developer account at [developer.equifax.com](https://developer.equifax.com/)
- An entitled product (e.g. Identity Verification, Digital Identity Trust) — Equifax onboarding is gated and requires legal review
- Client credentials (`client_id` + `client_secret`) and the product `scope`
- A deployment target for the webhook

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill EQUIFAX_API_BASE, EQUIFAX_CLIENT_ID, EQUIFAX_CLIENT_SECRET, EQUIFAX_SCOPE,
# ORY_WEBHOOK_SECRET
npm install
node server.js
```

Endpoints:

- `GET /health` — readiness check
- `POST /equifax/verify-identity` — Ory Action target

The handler caches the OAuth token for ~55 minutes (refresh-before-expiry) to amortize the token-exchange round-trip.

## Configure Ory

1. Use [`ory-actions.yaml`](ory-actions.yaml) to register the webhook.
2. The body template is [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet) — Equifax verification typically needs `first_name`, `last_name`, `date_of_birth`, `ssn_last_four`, and `address`. Extend the identity schema and the jsonnet body to carry those fields.
3. Set `response.parse: true` and `response.ignore: false` so Ory consumes the verification verdict.

## Troubleshooting

- **`equifax token` 401** — confirm the `scope` matches the product you've been entitled to in the Equifax developer portal. The scope is product-specific.
- **Sandbox vs production** — sandbox uses `https://api.sandbox.equifax.com`; production uses `https://api.equifax.com`. Mixing credentials and base URLs returns 401.
- **PII in logs** — Equifax responses can include sensitive matched attributes. Strip them from logs before shipping to your SIEM.

## Resources

- [Equifax Developer Portal](https://developer.equifax.com/)
- [Equifax Digital Identity Trust API](https://developer.equifax.com/products/digital-identity-trust)
- [Ory Actions and webhooks](https://www.ory.com/docs/actions/web-hook)
