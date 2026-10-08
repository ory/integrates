# LexisNexis InstantID

> **Maintained by:** Ory Engineering

[LexisNexis Risk Solutions](https://risk.lexisnexis.com) provides InstantID — a database-backed identity-verification API that scores name/address/SSN/DOB matches and returns NAS / NAP / CVI scores. Common in US financial-services and insurance flows where document scans are too high-friction. This integration runs InstantID from an Ory Action before the identity is saved, rejects registrations that fail your thresholds, and gates login on the stored verification status.

**Type:** webhook (Ory Actions over HTTP — code in [`webhook/`](./webhook/))
**Docs page:** [ory.com/docs/integrates-with/identity-verification/lexisnexis](https://www.ory.com/docs/integrates-with/identity-verification/lexisnexis)

## Endpoints

| Path | Trigger | Auth | Purpose |
| --- | --- | --- | --- |
| `POST /lexisnexis/verify` | `registration.after`, `response.parse: true`, before the identity is saved | `X-Webhook-Secret` | Calls LexisNexis InstantID with the identity's PII and evaluates NAS, NAP, and CVI against thresholds. On a pass, responds `200` with `{"identity": {"metadata_public": {"lexisnexis_verification_status": "verified", ...}}}`. On a fail, or when LexisNexis can't be reached, responds `403` with a `messages` body to reject the registration. |
| `POST /lexisnexis/validate` | `login.after`, `response.parse: true` | `X-Webhook-Secret` | Blocks login when `metadata_public.lexisnexis_verification_status == "failed"`, for example after you mark an identity as failed through the Ory Admin API. |

The verify action runs before the identity is saved, so `ctx.identity.id` is `00000000-0000-0000-0000-000000000000` and the identity isn't in the Admin API yet. The handler returns the result in the response body instead of patching the identity, and Ory saves the returned metadata with the new identity. Ory replaces `metadata_public` with the returned object, so the handler merges in the values the Jsonnet body sends.

## NAS, NAP, and CVI

LexisNexis returns three scores per inquiry. Compare each on its own scale, and choose thresholds with LexisNexis for your risk profile:

- **NAS** — name, address, and SSN summary, from 0 to 12. 12 means the first name, last name, address, and SSN all matched.
- **NAP** — name, address, and phone summary, from 0 to 12. 12 means the first name, last name, address, and phone all matched.
- **CVI** — Comprehensive Verification Index, from 0 to 50 in steps of 10. 0 means nothing was verified, and 50 means full name, address, phone, and SSN were verified.

The handler passes when InstantID's verification indicator is `Pass`, CVI meets its threshold, and NAS or NAP meets its threshold. A score of 0 means LexisNexis found no matching records, not that the person is fraudulent.

## Required env vars

```
ORY_WEBHOOK_SECRET            X-Webhook-Secret value Ory sends
LEXISNEXIS_USERNAME           InstantID username
LEXISNEXIS_PASSWORD           InstantID password
LEXISNEXIS_API_URL            InstantID API URL
LEXISNEXIS_ORG_ID             InstantID organization id
INSTANTID_NAS_THRESHOLD       minimum NAS, 0-12
INSTANTID_NAP_THRESHOLD       minimum NAP, 0-12
INSTANTID_CVI_THRESHOLD       minimum CVI, 0-50
PORT                          default: 3000
```

## Run

```bash
cd webhook/
cp .env.example .env
npm install
npm start              # runs `tsx server.ts`
```

## Configure Ory

1. Merge [`ory-actions.yaml`](./ory-actions.yaml) into your identity configuration. It puts both actions in the method-specific lists (`selfservice.flows.registration.after.password.hooks` and `selfservice.flows.login.after.password.hooks`). Repeat them for every method you enable, such as `oidc` or `code`: Ory runs the flow-level `after.hooks` list only for a method that has no hooks of its own. Keep the `session` hook last in the registration lists.
2. The body templates are in [`jsonnet/`](./jsonnet/). On Ory Network, encode each template with `base64 < jsonnet/verify.jsonnet | tr -d '\n'` and set `body: base64://<encoded>`.
3. Both endpoints block with `403` and this body, which Ory shows to the user:

   ```json
   {"messages": [{"instance_ptr": "#/", "messages": [{"id": 9001001, "text": "We couldn't verify your identity.", "type": "error"}]}]}
   ```

4. Ory waits about 30 seconds for the handler. The InstantID call is capped at 15 seconds.

## License

Apache-2.0. SPDX header in each source file.
