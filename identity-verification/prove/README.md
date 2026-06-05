# Prove

> **Maintained by:** Ory Engineering

[Prove](https://www.prove.com) (formerly Payfone) is a phone-anchored identity platform — telecom signals, SIM-swap detection, identity prefill, and continuous phone-ownership verification. This integration calls Prove from Ory Actions across three lifecycle points: pre-registration lookup (prefill), post-registration enrollment, and per-login validation.

**Type:** webhook (Ory Actions over HTTP — code in [`webhook/`](./webhook/))
**Docs page:** [ory.com/docs/integrates-with/identity-verification/prove](https://www.ory.com/docs/integrates-with/identity-verification/prove)

## Endpoints

| Path | Trigger | Auth | Purpose |
| --- | --- | --- | --- |
| `POST /prove/lookup` | sync `registration.before`, `can_interrupt: true` | `X-Webhook-Secret` | Pre-registration phone-number lookup. Returns identity-prefill metadata (name, address, DOB) when Prove knows the phone, or surfaces a SIM-swap / low-trust signal that the registration hook can use to gate the flow. |
| `POST /prove/enroll` | sync `registration.after` | `X-Webhook-Secret` | Registers the user's phone with Prove's Identity Manager; stores the resulting `prove_identity_id` on `metadata_admin`. |
| `POST /prove/validate` | sync `login.after`, `can_interrupt: true` | `X-Webhook-Secret` | Confirms the user's stored Prove identity is still in good standing (no recent SIM swap, ownership unchanged); blocks login on a fail. |

All three are sync — Prove's APIs return decisions in the response, so there is no async callback path to verify.

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

1. Use [`ory-actions.yaml`](./ory-actions.yaml) as the snippet for `registration.before` (lookup), `registration.after` (enroll), and `login.after` (validate).
2. The body templates are in [`jsonnet/`](./jsonnet/).
3. **Phone collection is a prerequisite** — your identity schema must capture a phone number in E.164 format before the `prove/lookup` hook fires; surface the field on your registration UI.

## Notes

- Uses Prove's official SDK (`@prove-identity/prove-api`) for the API surface.
- The handler defaults to Prove's UAT environment (`platform.uat.proveapis.com`); override `PROVE_SERVER_URL` for production.

## License

Apache-2.0. SPDX header in each source file.
