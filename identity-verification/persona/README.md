# Persona

> **Maintained by:** Ory Engineering

[Persona](https://withpersona.com) is an identity verification platform with configurable templates (document capture, selfie + liveness, database checks, watchlist screening). This integration creates a Persona Inquiry after registration, consumes Persona's HMAC-signed callback when the inquiry changes status, and gates login on the stored verification status.

**Type:** webhook (Ory Actions over HTTP — code in [`webhook/`](./webhook/))
**Docs page:** [ory.com/docs/integrates-with/identity-verification/persona](https://www.ory.com/docs/integrates-with/identity-verification/persona)

## Endpoints

| Path | Trigger | Auth | Purpose |
| --- | --- | --- | --- |
| `POST /persona/initiate` | your backend after sign-up, or `registration.after` without `response.parse` | `X-Webhook-Secret` | Creates a Persona Inquiry with `reference-id = <Ory identity ID>`, stores the inquiry ID in `metadata_public.persona_inquiry_id`, and returns the hosted `verification_url`. |
| `POST /persona/callback` | async, FROM Persona | `Persona-Signature` header: `t=<timestamp>,v1=<HMAC-SHA256 of "<timestamp>.<raw body>">` | Resolves the identity via the inquiry's `reference-id` and writes the inquiry status to `metadata_public.persona_verification_status`. |
| `POST /persona/validate` | `login.after`, `response.parse: true` | `X-Webhook-Secret` | Blocks login when `metadata_public.persona_verification_status == "declined"`. |

Persona sets the inquiry status to `completed`, `failed`, or `expired` as the user finishes. `approved`, `declined`, and `needs_review` appear only when your Persona template or workflow makes that decision.

## Required env vars

```
ORY_WEBHOOK_SECRET        Bearer / X-Webhook-Secret value Ory sends
KRATOS_ADMIN_URL          Ory Network admin URL (or self-hosted Kratos admin)
ORY_API_KEY               Ory admin API token (identities:write)
PERSONA_API_KEY           Persona API key
PERSONA_TEMPLATE_ID       Persona template (configures which checks run)
PERSONA_WEBHOOK_SECRET    HMAC secret for /persona/callback
PERSONA_HOSTED_URL        default: https://inquiry.withpersona.com/verify
PERSONA_API_BASE          default: https://api.withpersona.com/api/v1
PORT                      default: 3000
```

## Run

```bash
cd webhook/
cp .env.example .env   # if present; otherwise set the vars above
npm install
npm start              # runs `tsx server.ts`
```

## Configure Ory

1. Start the inquiry from your application. Ory doesn't relay webhook responses to the browser, so an Ory Action can't send the user to Persona. After sign-up, have your backend call `/persona/initiate` with the `X-Webhook-Secret` header and the identity ID and traits from the Ory session, then send the user to the returned `verification_url`.
2. To create the inquiry from an Ory Action instead, use the registration hook in [`ory-actions.yaml`](./ory-actions.yaml). It has no `response.parse`, so it runs after the identity is saved. Your backend then reads `persona_inquiry_id` from the identity through the Ory Admin API and sends the user to the inquiry. With `response.parse: true`, the action would run before the identity is saved and receive the ID `00000000-0000-0000-0000-000000000000`.
3. Merge [`ory-actions.yaml`](./ory-actions.yaml) into your identity configuration. It puts the hooks in the method-specific lists (`selfservice.flows.registration.after.password.hooks` and `selfservice.flows.login.after.password.hooks`). Both lists are aliased into the `oidc`, `code`, `passkey`, and `webauthn` lists, because Ory runs the flow-level `after.hooks` list only for a method that has no hooks of its own. Add any other method you enable, such as `saml`, the same way. Keep the `session` hook last in the registration lists.
4. The body templates are in [`jsonnet/`](./jsonnet/). On Ory Network, encode each template with `base64 < jsonnet/validate.jsonnet | tr -d '\n'` and set `body: base64://<encoded>`. The webhook payload has no `metadata_admin`, so the status lives in `metadata_public`.
5. `/persona/validate` blocks sign-in with `403` and this body, which Ory shows to the user:

   ```json
   {"messages": [{"instance_ptr": "#/", "messages": [{"id": 9001001, "text": "Identity verification failed. Please contact support.", "type": "error"}]}]}
   ```

6. Set `ORY_WEBHOOK_SECRET` (handler) to match the `X-Webhook-Secret` value declared in the action config.
7. The `/persona/callback` URL must be publicly reachable; configure it as the webhook target in **Persona → Webhooks**, subscribe it to the inquiry events you use, and set `PERSONA_WEBHOOK_SECRET` to that webhook's secret.

## License

Apache-2.0. SPDX header in each source file.
