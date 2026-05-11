# Onfido Identity Verification

> **Maintained by:** Community contributors
> **Status:** Reference implementation — needs review against the integration spec.

Onfido identity verification integrated with Ory Network via Ory Actions webhooks.

**Pattern:** Layer 1 — the webhook handler calls the **Ory Admin API** directly using `@ory/client` to read and patch identity metadata.

**Type:** webhook
**Docs page:** [ory.com/docs/integrations/onfido](https://ory.com/docs/integrations/) *(to be written)*

## How it works

1. User submits an identity-verification request in the Ory-powered application.
2. Ory triggers a webhook to this handler.
3. The handler authenticates the request with `Authorization: Bearer ${WEBHOOK_SECRET}`.
4. The handler calls the Onfido API to start a verification workflow.
5. The handler verifies Onfido's signed callback using HMAC and updates the identity's metadata in Ory.

## Required env vars

```
KRATOS_ADMIN_URL          # Ory Network admin URL
ORY_API_KEY               # Ory admin API token
ONFIDO_API_TOKEN
ONFIDO_REGION             # EU | US | CA
ONFIDO_WORKFLOW_ID
ONFIDO_WEBHOOK_TOKEN      # Onfido HMAC secret for callback verification
WEBHOOK_SECRET            # Bearer token Ory sends in Authorization header
PORT                      # default 3000
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
- [ ] Onfido workflow configuration walkthrough
- [ ] `.env.example` file
- [ ] `package.json` license → Apache-2.0
- [ ] Jsonnet body templates extracted to `config/jsonnet/`
- [ ] `ory-actions.yaml` snippet
- [ ] Tests
