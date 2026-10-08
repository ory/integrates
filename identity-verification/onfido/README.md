# Onfido

> **Maintained by:** Ory Engineering

[Onfido](https://onfido.com) is a global identity-verification platform — document, biometric, motion, and database checks composed via configurable workflows. This integration creates an Onfido applicant + workflow run after registration, consumes Onfido's HMAC-signed callback when the workflow finishes, and gates login on the stored verification status.

**Type:** webhook (Ory Actions over HTTP — code in [`webhook/`](./webhook/))
**Docs page:** [ory.com/docs/integrates-with/identity-verification/onfido](https://www.ory.com/docs/integrates-with/identity-verification/onfido)

## Endpoints

| Path | Trigger | Auth | Purpose |
| --- | --- | --- | --- |
| `POST /onfido/initiate` | your backend after sign-up | `X-Webhook-Secret` | Creates an Onfido applicant and workflow run with `custom_data.kratos_identity_id`; writes the Onfido IDs to `metadata_public`; returns the SDK token to the caller. |
| `POST /onfido/callback` | async, FROM Onfido | `X-SHA2-Signature` (HMAC-SHA256 of raw body) | Resolves the identity via `custom_data.kratos_identity_id`; writes the workflow run status (`approved` / `review` / `declined`) to `metadata_public.onfido_verification_status`. |
| `POST /onfido/validate` | `login.after`, `response.parse: true` | `X-Webhook-Secret` | Blocks login when `metadata_public.onfido_verification_status == "declined"`. |

## Required env vars

```
ORY_WEBHOOK_SECRET        X-Webhook-Secret value Ory and your backend send
KRATOS_ADMIN_URL          Ory Network admin URL (or self-hosted Kratos admin)
ORY_API_KEY               Ory admin API token (identities:write)
ONFIDO_API_TOKEN          Onfido API token
ONFIDO_REGION             EU | US | CA  (selects API base host)
ONFIDO_WORKFLOW_ID        Workflow id (defines what checks run)
ONFIDO_WEBHOOK_TOKEN      HMAC secret for /onfido/callback
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

1. Call `/onfido/initiate` from your backend after sign-up, with the `X-Webhook-Secret` header and a JSON body of `kratos_identity_id`, `first_name`, `last_name`, and optionally `email` and `date_of_birth`, taken from the Ory session. Render the Onfido SDK with the returned `sdk_token`. Ory doesn't relay webhook responses to the browser, so start this step from your application. The SDK token is short-lived; use it immediately.
2. Merge [`ory-actions.yaml`](./ory-actions.yaml) into your identity configuration. It puts `/onfido/validate` in `selfservice.flows.login.after.password.hooks` with `response.parse: true`. Repeat it for every method you enable, such as `oidc` or `code`: Ory runs the flow-level `after.hooks` list only for a method that has no hooks of its own.
3. The body template is in [`jsonnet/`](./jsonnet/). On Ory Network, encode it with `base64 < jsonnet/validate.jsonnet | tr -d '\n'` and set `body: base64://<encoded>`.
4. `/onfido/validate` blocks sign-in with `403` and this body, which Ory shows to the user:

   ```json
   {"messages": [{"instance_ptr": "#/", "messages": [{"id": 9001001, "text": "Identity verification failed. Please contact support.", "type": "error"}]}]}
   ```

5. The `/onfido/callback` URL must be publicly reachable; configure it under **Onfido Dashboard → Webhooks** with the matching `ONFIDO_WEBHOOK_TOKEN`.

## License

Apache-2.0. SPDX header in each source file.
