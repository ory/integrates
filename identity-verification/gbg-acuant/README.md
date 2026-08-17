# GBG (Acuant) — Ory Network Integration

> **Maintained by:** Community contributors

**Docs page:** [ory.com/docs/integrates-with/identity-verification/gbg-acuant](https://www.ory.com/docs/integrates-with/identity-verification/gbg-acuant)

## Overview

GBG (which acquired Acuant) is a global identity verification provider with deep document and biometric coverage. This integration calls the GBG identity verification API from an Ory Actions webhook during registration to verify document + selfie evidence, and returns the GBG decision so Ory can gate the registration flow.

## How it works

```
User completes registration in Ory UI
        ↓
Ory Action webhook → POST /gbg/verify-identity
        ↓
Handler authenticates the request (X-Webhook-Secret)
        ↓
Handler calls GBG GO Journey API with the identity payload
        ↓
GBG returns decision (PASS / REFER / FAIL)
        ↓
Handler echoes decision back to Ory
        ↓
Ory Action consumes the response — fails the flow on REFER/FAIL,
or writes the verdict into identity.metadata for downstream policy
```

## Prerequisites

- Ory Network project
- GBG GO account with a configured **journey** (the journey ID is required)
- A deployment target for the webhook (Cloud Run, Container Apps, Lambda behind API Gateway, your own VM)

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill GBG_API_BASE, GBG_API_TOKEN, GBG_JOURNEY_ID, ORY_WEBHOOK_SECRET
npm install
node server.js
```

Endpoints:

- `GET /health` — readiness check
- `POST /gbg/verify-identity` — Ory Action target

## Configure Ory

1. Use the snippet in [`ory-actions.yaml`](ory-actions.yaml) to register the webhook on your registration flow's `after` hooks.
2. The body template is [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet) — extend it if your identity schema carries additional verification inputs (document image, selfie image, address).
3. Set `ORY_WEBHOOK_SECRET` in `.env` to match the `X-Webhook-Secret` value declared in the Ory hook config.
4. Set `response.parse: true` and `response.ignore: false` on the hook (already set in `ory-actions.yaml`) so Ory consumes the GBG decision.

## Troubleshooting

- **401 from the handler** — `X-Webhook-Secret` mismatch with the Ory hook config.
- **`gbg_error` 5xx** — check the journey ID is valid and the API token has permission to create cases on that journey.
- **Document / selfie images missing** — GBG's journey behavior depends on which evidence types it expects; align the schema fields to the journey definition.
- **Slow first call** — GBG cold-paths can be ~5–10 s on first request; the handler caps at 15 s.

## Resources

- [GBG GO API documentation](https://docs.gbgplc.com/identity)
- [Ory Actions and webhooks](https://www.ory.com/docs/guides/integrate-with-ory-cloud-through-webhooks)
