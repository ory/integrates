# GBG (Acuant) — Ory Network Integration

> **Maintained by:** Community contributors

**Docs page:** [ory.com/docs/integrates-with/identity-verification/gbg-acuant](https://www.ory.com/docs/integrates-with/identity-verification/gbg-acuant)

## Overview

GBG (which acquired Acuant) is a global identity verification provider with deep document and biometric coverage. This integration calls the GBG identity verification API from an Ory Actions webhook during registration to verify document + selfie evidence, and rejects the registration unless GBG passes it.

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
Handler turns the decision into a response:
  PASS          → 200 with the verdict for identity metadata
  FAIL          → 400 with a messages body, registration rejected
  REFER         → rejected, or let through when GBG_REFER_ACTION=allow
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
npm start
```

Endpoints:

- `GET /health` — readiness check
- `POST /gbg/verify-identity` — Ory Action target

## Configure Ory

1. Use the snippet in [`ory-actions.yaml`](ory-actions.yaml) to register the webhook on your registration method's `after` hooks.
2. The body template is [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet) — extend it if your identity schema carries additional verification inputs (document image, selfie image, address).
3. Set `ORY_WEBHOOK_SECRET` in `.env` to match the `X-Webhook-Secret` value declared in the Ory hook config.
4. Keep `response.parse: true` on the hook (already set in `ory-actions.yaml`) so the handler can reject the registration and return metadata. Ory doesn't interpret the GBG decision, and any `200` lets the registration through.
5. Set `GBG_REFER_ACTION=allow` to let `REFER` cases register and review them later; the default rejects them.

- Put the hook in the method-specific list, such as `selfservice.flows.registration.after.password.hooks`, and repeat it for every method you enable, such as `oidc` or `code`. Ory runs the global `registration.after.hooks` list only for a method that has no hooks of its own. Keep the `session` hook last.
- `body: file://./jsonnet/...` works for self-hosted Ory Kratos. On Ory Network, encode the template with `base64 < jsonnet/identity.jsonnet | tr -d '\n'` and set `body: base64://<encoded>`.
- With `response.parse: true`, the action runs before the identity is saved, so `ctx.identity.id` is `00000000-0000-0000-0000-000000000000`. The handler sends its own reference to the vendor and returns it as the identity's `external_id`; look the identity up later with `GET /admin/identities/by/external/<reference>`.
- Ory waits about 30 seconds for the handler and retries a `5xx` response (three attempts in total).

To reject the flow, the handler responds with a `4xx` status code and this body. Ory shows the `text` to the user:

```json
{
  "messages": [
    {
      "instance_ptr": "#/",
      "messages": [{ "id": 9000202, "text": "We couldn't verify your identity documents.", "type": "error" }]
    }
  ]
}
```

## Troubleshooting

- **401 from the handler** — `X-Webhook-Secret` mismatch with the Ory hook config.
- **`gbg_error` 5xx** — check the journey ID is valid and the API token has permission to create cases on that journey.
- **Document / selfie images missing** — GBG's journey behavior depends on which evidence types it expects; align the schema fields to the journey definition.
- **Slow first call** — GBG cold-paths can be ~5–10 s on first request; the handler caps at 15 s.

## Resources

- [GBG GO API documentation](https://docs.gbgplc.com/identity)
- [Ory Actions and webhooks](https://www.ory.com/docs/guides/integrate-with-ory-cloud-through-webhooks)
