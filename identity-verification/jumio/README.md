# Jumio

> **Maintained by:** Ory Engineering

[Jumio](https://www.jumio.com) is a high-assurance identity-verification platform — Document + Selfie + Face Match — common in regulated industries (financial services, healthcare, gambling, crypto). This integration starts a Jumio workflow from an Ory Action after registration, consumes Jumio's HMAC-signed callback when the workflow finishes, and gates login on the stored verification status.

**Type:** webhook (Ory Actions over HTTP — code in [`webhook/`](./webhook/))
**Docs page:** [ory.com/docs/integrates-with/identity-verification/jumio](https://www.ory.com/docs/integrates-with/identity-verification/jumio)

## Endpoints

| Path | Trigger | Auth | Purpose |
| --- | --- | --- | --- |
| `POST /jumio/initiate` | `registration.after` without `response.parse`, after the identity is saved | `X-Webhook-Secret` | Starts a Jumio workflow with `customerInternalReference = <Ory identity ID>`; writes the Jumio account ID and the status `initiated` to `metadata_public`. |
| `POST /jumio/callback` | async, FROM Jumio | HMAC-SHA256 over raw body | Resolves the identity via `customerInternalReference`; writes the workflow decision (`PASSED` / `WARNING` / `REJECTED`) to `metadata_public.jumio_verification_decision` and sets `metadata_public.jumio_verification_status`. |
| `POST /jumio/validate` | `login.after`, `response.parse: true` | `X-Webhook-Secret` | Blocks login when `metadata_public.jumio_verification_status == "rejected"`. |

The callback sets `jumio_verification_status` to `verified` for `PASSED` and to `rejected` for every other decision, including `WARNING`. Change that mapping in the handler if you want to send `WARNING` to manual review instead of blocking sign-in.

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

1. Merge [`ory-actions.yaml`](./ory-actions.yaml) into your identity configuration. It puts the hooks in the method-specific lists (`selfservice.flows.registration.after.password.hooks` and `selfservice.flows.login.after.password.hooks`). Both lists are aliased into the `oidc`, `code`, `passkey`, and `webauthn` lists, because Ory runs the flow-level `after.hooks` list only for a method that has no hooks of its own. Add any other method you enable, such as `saml`, the same way. Keep the `session` hook last in the registration lists.
2. The body templates are in [`jsonnet/`](./jsonnet/). On Ory Network, encode each template with `base64 < jsonnet/initiate.jsonnet | tr -d '\n'` and set `body: base64://<encoded>`.
3. Keep `response.parse` off for `/jumio/initiate`. With `response.parse: true`, the action runs before the identity is saved and receives the ID `00000000-0000-0000-0000-000000000000`, so Jumio's `customerInternalReference` and the handler's Admin API update can't find the identity.
4. `/jumio/validate` blocks sign-in with `403` and this body, which Ory shows to the user:

   ```json
   {"messages": [{"instance_ptr": "#/", "messages": [{"id": 9001001, "text": "Identity verification failed. Please contact support.", "type": "error"}]}]}
   ```

5. Ory doesn't relay webhook responses to the browser. After sign-up, your application starts the Jumio capture (web client or SDK) for the workflow the handler created.
6. The `/jumio/callback` URL must be publicly reachable; configure it as the workflow callback in **Jumio Customer Portal → Workflow Definition** with the matching `JUMIO_CALLBACK_SECRET`.

## License

Apache-2.0. SPDX header in each source file.
