# LexisNexis InstantID

> **Maintained by:** Community contributors
> **Status:** Reference implementation — needs review against the integration spec.

LexisNexis InstantID identity verification (NAS / NAP / CVI scoring) integrated with Ory Network via Ory Actions webhooks.

**Pattern:** Layer 1 — the webhook handler calls the **Ory Admin API** directly using `@ory/client` to read and patch identity metadata.

**Type:** webhook
**Docs page:** [ory.com/docs/integrations/lexisnexis](https://ory.com/docs/integrations/) *(to be written)*

## How it works

1. User submits an identity-verification request in the Ory-powered application.
2. Ory triggers a webhook to this handler.
3. The handler authenticates the request with `Authorization: Bearer ${WEBHOOK_SECRET}`.
4. The handler calls the LexisNexis InstantID API and evaluates NAS / NAP / CVI scores against configured thresholds.
5. The handler patches the identity's metadata in Ory with the verification result.

## Required env vars

```
KRATOS_ADMIN_URL              # Ory Network admin URL
ORY_API_KEY                   # Ory admin API token
LEXISNEXIS_USERNAME
LEXISNEXIS_PASSWORD
LEXISNEXIS_API_URL
LEXISNEXIS_ORG_ID
INSTANTID_NAS_THRESHOLD       # default 50
INSTANTID_NAP_THRESHOLD       # default 50
INSTANTID_CVI_THRESHOLD       # default 50
WEBHOOK_SECRET                # Bearer token Ory sends in Authorization header
PORT                          # default 3000
```

## Run locally

```bash
npm install
node --loader ts-node/esm index.ts
```

## Code

Main entry point: [`index.ts`](index.ts).

## TODO (phase 3 review)

- [ ] Detailed step-by-step Console setup
- [ ] InstantID account / org configuration walkthrough
- [ ] Threshold tuning guidance
- [ ] `.env.example` file
- [ ] `package.json` license → Apache-2.0
- [ ] Jsonnet body templates extracted to `config/jsonnet/`
- [ ] `ory-actions.yaml` snippet
- [ ] Tests
