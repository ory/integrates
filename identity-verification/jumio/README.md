# Jumio Identity Verification

> **Maintained by:** Community contributors
> **Status:** Reference implementation — needs review against the integration spec.

Jumio identity verification (Document + Selfie + Face Match) integrated with Ory Network via Ory Actions webhooks.

**Pattern:** Layer 1 — the webhook handler calls the **Ory Admin API** directly using `@ory/client` to read and patch identity metadata. (Layer 2 webhooks return identity changes in the response body; this integration predates that pattern.)

**Type:** webhook
**Docs page:** [ory.com/docs/integrations/jumio](https://ory.com/docs/integrations/) *(to be written)*

## How it works

1. User submits an identity-verification request in the Ory-powered application.
2. Ory triggers a webhook to this handler.
3. The handler authenticates the request with `Authorization: Bearer ${WEBHOOK_SECRET}`.
4. The handler calls the Jumio API to start a verification workflow.
5. On completion (via Jumio's callback), the handler patches the identity's metadata in Ory using `@ory/client`.

## Required env vars

```
KRATOS_ADMIN_URL          # Ory Network admin URL
ORY_API_KEY               # Ory admin API token
JUMIO_CLIENT_ID
JUMIO_CLIENT_SECRET
JUMIO_AUTH_URL
JUMIO_API_BASE_URL
WEBHOOK_SECRET            # Bearer token Ory sends in Authorization header
PORT                      # default 3000
```

## Run locally

```bash
npm install
node --loader ts-node/esm index.ts   # or compile + run with tsx / ts-node
```

## Code

Main entry point: [`index.ts`](index.ts).

## TODO (phase 3 review)

- [ ] Detailed step-by-step Console setup
- [ ] Jumio template configuration walkthrough
- [ ] `.env.example` file
- [ ] `package.json` license → Apache-2.0
- [ ] Jsonnet body templates extracted to `config/jsonnet/`
- [ ] `ory-actions.yaml` snippet
- [ ] Tests
