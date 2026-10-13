# Okta Verify

> **Maintained by:** Community contributors

[Okta Verify](https://www.okta.com/products/multi-factor-authentication/) is Okta's first-party MFA app supporting push notifications and one-time codes. This integration verifies an Okta Verify code from an Ory Action webhook at sign-in and blocks the sign-in unless Okta accepts it.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrates-with/mfa/okta-verify](https://www.ory.com/docs/integrates-with/mfa/okta-verify)

## Use case

An enterprise has already standardized its workforce on Okta Verify and wants to reuse that enrollment from Ory-hosted login flows without re-enrolling users in Ory's native TOTP or WebAuthn.

## Before you start

Ory Kratos Identities has built-in second factors: [WebAuthn and passkeys](https://www.ory.com/docs/kratos/mfa/webauthn-fido-yubikey), [TOTP](https://www.ory.com/docs/kratos/mfa/totp), lookup secrets, and one-time codes. They run inside the login flow and raise the session to AAL2. Use them unless you must keep Okta Verify as the second factor.

An Ory Action is a single HTTP request from Ory to this handler:

- Ory waits about 30 seconds for a response.
- Ory retries a `5xx` response, three attempts in total. The handler reports every failure as a `4xx` so a retry never repeats a vendor call.
- Ory doesn't relay the webhook response to your UI.
- A factor checked by an Ory Action doesn't raise the session's AAL. The session stays at AAL1.

For these reasons the handler checks a one-time code that the login UI collects together with the primary credentials, and doesn't wait for a push. To use Okta Verify push, run it from your application after Ory issues the session.

## How it works

1. The login UI collects the Okta Verify code together with the primary credentials and sends it in the flow's `transient_payload` as `okta_pass_code`.
2. After the primary credentials succeed, Ory calls this handler with the identity ID, `metadata_public.okta_user_id`, and the code.
3. The handler finds the user's active Okta Verify code factor (`token:software:totp`, provider `OKTA`) with `GET /api/v1/users/{userId}/factors`.
4. The handler POSTs `{"passCode": "..."}` to `/api/v1/users/{userId}/factors/{factorId}/verify`. Okta answers immediately.
5. The handler responds `200` on `SUCCESS` and blocks the sign-in otherwise.

Users without an `okta_user_id` or without an active Okta Verify code factor are unenrolled. By default the handler blocks them with a message that tells them to enroll. Set `OKTA_ALLOW_UNENROLLED=true` to let them sign in without the check.

To block the sign-in, the handler responds with `403` and a body that Ory Kratos Identities shows to the user:

```json
{
  "messages": [
    {
      "instance_ptr": "#/",
      "messages": [{ "id": 9002003, "text": "The Okta Verify code is invalid.", "type": "error" }]
    }
  ]
}
```

On success, it responds with `200` and `{}`.

## Prerequisites

- An Ory Network project.
- An Okta org URL (`https://your-org.okta.com`).
- An Okta API token (SSWS) with permission to read user factors and verify them.
- Users enrolled in Okta Verify.
- `metadata_public.okta_user_id` on each Ory identity, set at enrollment through the Ory Admin API. The webhook payload doesn't include `metadata_admin`.
- A deployment target for the webhook handler.

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill ORY_WEBHOOK_SECRET, OKTA_ORG_URL, OKTA_API_TOKEN,
# and optionally OKTA_ALLOW_UNENROLLED=true.
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /okta-verify/verify` — Ory Action target.

## Configure Ory

1. Encode the body template with `base64 < jsonnet/identity.jsonnet | tr -d '\n'` and put the result in the `body` of the hook in [`ory-actions.yaml`](ory-actions.yaml).
2. Merge [`ory-actions.yaml`](ory-actions.yaml) into the identity configuration. It puts the hook in `selfservice.flows.login.after.password.hooks` with `response.parse: true` and aliases that list into the `oidc`, `code`, `passkey`, and `webauthn` lists. Add any other login method you enable, such as `saml`, the same way. Ory Kratos Identities runs the global `selfservice.flows.login.after.hooks` list only for a method that has no hooks of its own.
3. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value in the hook config.
4. In your login UI, send the code in the flow's `transient_payload` as ``okta_pass_code``.

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match `X-Webhook-Secret` in the Ory hook config.
- **"Okta Verify is unavailable"** — the Okta call failed. Check the handler log; a `401` from Okta means the SSWS token is revoked, expired, or for another org.
- **"Set up Okta Verify before you sign in"** — the identity has no `metadata_public.okta_user_id`, the Okta user doesn't exist, or the user has no active Okta Verify code factor.
- **"Enter the code from Okta Verify"** — the login UI didn't send `okta_pass_code` in `transient_payload`.

## License

Apache-2.0. SPDX header at the top of each source file.
