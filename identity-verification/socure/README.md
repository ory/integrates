# Socure — Ory Network Integration

> **Maintained by:** Community contributors

## Overview

Socure is an ML-based identity verification platform with strong fraud detection and KYC coverage. This integration calls Socure ID+ from an Ory Actions webhook during registration; results are returned to Ory so the flow can be gated. The handler also exposes an async **callback endpoint** that Socure can post final results to for long-running verifications, with HMAC-SHA256 signature verification.

## How it works

```
Synchronous path (Ory Action)
─────────────────────────────
User completes registration
        ↓
Ory Action webhook → POST /socure/verify-identity
        ↓
Handler calls Socure ID+ (modules: kyc, fraud, ...)
        ↓
Socure returns reference_id + immediate decision
        ↓
Handler echoes back to Ory; Ory applies policy

Asynchronous path (Socure callback)
───────────────────────────────────
Socure → POST /socure/results-callback (HMAC-signed)
        ↓
Handler verifies signature
        ↓
Handler updates the matching Ory identity via Admin API
(metadata.public.socure_decision = ...)
```

## Endpoints

- `GET /health` — readiness check
- `POST /socure/verify-identity` — Ory Action target
- `POST /socure/results-callback` — Socure's async result webhook (HMAC-signed; configure the signing secret in the Socure admin)

## Prerequisites

- Ory Network project
- Socure account with an SDK key (`SOCURE_API_KEY`) and the modules you want to run (commonly `kyc`, `fraud`, `phonerisk`)
- A public URL for the `results-callback` endpoint if you use the async path
- A deployment target

## Deploy

```bash
cd webhook/
cp .env.example .env
# Fill SOCURE_API_KEY, SOCURE_MODULES, ORY_WEBHOOK_SECRET, SOCURE_CALLBACK_SECRET
npm install
node server.js
```

## Configure Ory

1. Register the sync hook with [`ory-actions.yaml`](ory-actions.yaml).
2. Body template: [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet). Socure benefits from a `device_session_id` collected client-side via the Socure SDK; pass it through `identity.traits.socure_device_session_id` if available.
3. For the async callback path, deploy the handler to a public URL and configure that URL + a signing secret in the Socure admin's webhook settings. Set `SOCURE_CALLBACK_SECRET` in `.env` to the same value.

## Implementing the async write-back

The `/socure/results-callback` handler currently logs the result. To complete the integration, write the verdict back to the identity:

```javascript
await fetch(`${ORY_PROJECT_URL}/admin/identities/${identity_id}`, {
  method: "PATCH",
  headers: {
    authorization: `Bearer ${ORY_ADMIN_API_KEY}`,
    "content-type": "application/json",
  },
  body: JSON.stringify([
    { op: "replace", path: "/metadata_public/socure_decision", value: req.body.decision },
  ]),
  signal: AbortSignal.timeout(5000),
});
```

(Add `ORY_PROJECT_URL` and `ORY_ADMIN_API_KEY` to `.env` and require them at startup.)

## Troubleshooting

- **`invalid signature` on `/socure/results-callback`** — verify that `SOCURE_CALLBACK_SECRET` matches the value configured in Socure, and that you didn't change the body parsing (HMAC is over the raw body).
- **Modules not running** — module names are case-sensitive in the request body; confirm `SOCURE_MODULES` matches Socure's documentation exactly.
- **`device_session_id` missing** — only available if you instrument the Socure SDK on the client. Without it, fraud signals are weaker but the call still works.

## Resources

- [Socure ID+ documentation](https://developer.socure.com/reference/idplus-overview)
- [Socure SDK reference](https://developer.socure.com/reference/sdk-overview)
- [Ory Actions and webhooks](https://www.ory.com/docs/actions/web-hook)
- [Ory Identity Admin API — patch identity](https://www.ory.com/docs/reference/api#tag/identity/operation/patchIdentity)
