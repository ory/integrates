# Prove

> **Maintained by:** Ory Engineering

[Prove](https://www.prove.com) (formerly Payfone) is a phone-anchored identity platform — telecom signals, SIM-swap detection, identity prefill, and continuous phone-ownership verification. This integration calls Prove from Ory Actions at two lifecycle points: enrollment after registration, and validation at each sign-in.

**Type:** webhook (Ory Actions over HTTP — code in [`webhook/`](./webhook/))
**Docs page:** [ory.com/docs/integrates-with/identity-verification/prove](https://www.ory.com/docs/integrates-with/identity-verification/prove)

## Endpoints

| Path | Trigger | Auth | Purpose |
| --- | --- | --- | --- |
| `POST /prove/enroll` | `registration.after` without `response.parse`, after the identity is saved | `X-Webhook-Secret` | Registers the user's phone with Prove's Identity Manager; stores the resulting `prove_identity_id` in `metadata_public`. |
| `POST /prove/validate` | `login.after`, `response.parse: true` | `X-Webhook-Secret` | Confirms the phone number Prove has on file still matches the user's; blocks sign-in on a mismatch. |

Prove's APIs return decisions in the response, so there is no async callback path to verify.

Prove's prefill isn't part of this integration. A `registration.before` action runs when Ory creates the flow, before the user enters anything, so its payload has no phone number, traits, or identity. To prefill a registration form, call Prove from your application before you show the form.

## Required env vars

```
ORY_WEBHOOK_SECRET        Bearer / X-Webhook-Secret value Ory sends
KRATOS_ADMIN_URL          Ory Network admin URL (or self-hosted Kratos admin)
ORY_API_KEY               Ory admin API token (identities:write)
PROVE_CLIENT_ID           Prove API client id
PROVE_CLIENT_SECRET       Prove API client secret
PROVE_SERVER_URL          default: https://platform.uat.proveapis.com (UAT)
                          Use https://platform.proveapis.com for production.
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
2. The body templates are in [`jsonnet/`](./jsonnet/). On Ory Network, encode each template with `base64 < jsonnet/enroll.jsonnet | tr -d '\n'` and set `body: base64://<encoded>`.
3. Keep `response.parse` off for `/prove/enroll`. With `response.parse: true`, the action runs before the identity is saved and receives the ID `00000000-0000-0000-0000-000000000000`, so the handler's Admin API update can't find the identity.
4. Keep `prove_identity_id` in `metadata_public`. The webhook payload doesn't include `metadata_admin`, so the validate action can't read values stored there.
5. `/prove/validate` blocks sign-in with `403` and this body, which Ory shows to the user. A `200` response always lets the user in, and Ory doesn't save identity changes that a `login.after` action returns:

   ```json
   {"messages": [{"instance_ptr": "#/", "messages": [{"id": 9001001, "text": "We couldn't confirm your phone number. Please contact support.", "type": "error"}]}]}
   ```

   Users without a Prove enrollment, and sign-ins while Prove can't be reached, are let through. Change that in the handler if you want to fail closed.
6. **Phone collection is a prerequisite** — your identity schema must capture a phone number in E.164 format; surface the field on your registration UI.

## Notes

- Uses Prove's official SDK (`@prove-identity/prove-api`) for the API surface.
- The handler defaults to Prove's UAT environment (`platform.uat.proveapis.com`); override `PROVE_SERVER_URL` for production.

## License

Apache-2.0. SPDX header in each source file.
