# Jumio

> **Maintained by:** Ory Engineering

[Jumio](https://www.jumio.com) is a high-assurance identity-verification platform — Document + Selfie + Face Match — common in regulated industries (financial services, healthcare, gambling, crypto). This integration starts a Jumio workflow from Ory Actions during registration, consumes Jumio's HMAC-signed callback when the workflow finishes, and gates login on the stored verification status.

**Type:** webhook (Ory Actions over HTTP — code in [`webhook/`](./webhook/))
**Docs page:** No dedicated Ory page yet. The webhook follows the patterns in the [Ory Actions web_hook docs](https://www.ory.com/docs/actions/web-hook).

## Endpoints

| Path | Trigger | Auth | Purpose |
| --- | --- | --- | --- |
| `POST /jumio/initiate` | sync `registration.after` | `X-Webhook-Secret` | Starts a Jumio workflow with `customerInternalReference = <Kratos identity id>`; writes the Jumio account/workflow IDs to `metadata_public`. |
| `POST /jumio/callback` | async, FROM Jumio | HMAC-SHA256 over raw body | Resolves the Kratos identity via `customerInternalReference`; PATCHes verdict (`PASSED` / `WARNING` / `FAILED`) onto the identity. |
| `POST /jumio/validate` | sync `login.after`, `can_interrupt: true` | `X-Webhook-Secret` | Blocks login when `metadata_public.jumio.status == "rejected"`. |

## Required env vars

```
ORY_WEBHOOK_SECRET        Bearer / X-Webhook-Secret value Ory sends
KRATOS_ADMIN_URL          Ory Network admin URL (or self-hosted Kratos admin)
ORY_API_KEY               Ory admin API token (identities:write)
JUMIO_AUTH_URL            Jumio OAuth token endpoint
JUMIO_API_BASE_URL        Jumio API base URL (region-specific)
JUMIO_CLIENT_ID           Jumio API client id
JUMIO_CLIENT_SECRET       Jumio API client secret
JUMIO_CALLBACK_SECRET     HMAC secret for /jumio/callback
PORT                      default: 3000
```

## Run

```bash
cd webhook/
cp .env.example .env
npm install
npm start              # runs `tsx server.ts`
```

## Configure Ory

1. Use [`ory-actions.yaml`](./ory-actions.yaml) as the snippet for `selfservice.flows.{registration,login}.after.hooks`.
2. The body templates are in [`jsonnet/`](./jsonnet/).
3. The `/jumio/callback` URL must be publicly reachable; configure it as the workflow callback in **Jumio Customer Portal → Workflow Definition** with the matching `JUMIO_CALLBACK_SECRET`.

## License

Apache-2.0. SPDX header in each source file.
