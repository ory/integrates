# Duo Security

> **Maintained by:** Community contributors

[Duo Security](https://duo.com) (a Cisco company) is an enterprise MFA platform with push and passcode flows. This integration verifies a Duo passcode from an Ory Action webhook at sign-in and blocks the sign-in unless Duo allows it.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrates-with/mfa/duo-security](https://www.ory.com/docs/integrates-with/mfa/duo-security)

## Use case

An enterprise has already standardized its workforce on Duo for MFA and wants to reuse that enrollment from Ory-hosted login flows without re-enrolling users in Ory's native TOTP or WebAuthn.

## Before you start

Ory Kratos Identities has built-in second factors: [WebAuthn and passkeys](https://www.ory.com/docs/kratos/mfa/webauthn-fido-yubikey), [TOTP](https://www.ory.com/docs/kratos/mfa/totp), lookup secrets, and one-time codes. They run inside the login flow and raise the session to AAL2. Use them unless you must keep Duo as the second factor.

An Ory Action is a single HTTP request from Ory to this handler:

- Ory waits about 30 seconds for a response.
- Ory retries a `5xx` response, three attempts in total. The handler reports every failure as a `4xx` so a retry never repeats a vendor call.
- Ory doesn't relay the webhook response to your UI.
- A factor checked by an Ory Action doesn't raise the session's AAL. The session stays at AAL1.

For these reasons the handler checks a one-time code that the login UI collects together with the primary credentials, and doesn't wait for a push. To use Duo Push or the Duo Universal Prompt, run it from your application after Ory issues the session.

## How it works

1. The login UI collects a Duo passcode together with the primary credentials and sends it in the flow's `transient_payload` as `duo_passcode`.
2. After the primary credentials succeed, Ory calls this handler with the identity ID as the Duo username, the passcode, and the client IP from the `True-Client-Ip` header.
3. The handler signs a Duo Auth API request with HMAC-SHA1 and POSTs to `/auth/v2/auth` with `factor=passcode`. Duo answers immediately with `allow` or `deny`.
4. The handler responds `200` on `allow` and blocks the sign-in otherwise.

To block the sign-in, the handler responds with `403` and a body that Ory Kratos Identities shows to the user:

```json
{
  "messages": [
    {
      "instance_ptr": "#/",
      "messages": [{ "id": 9001004, "text": "Duo verification failed.", "type": "error" }]
    }
  ]
}
```

On success, it responds with `200` and `{}`.

## Prerequisites

- An Ory Network project.
- A Duo **Auth API** application in the Duo Admin Panel, with `DUO_API_HOST`, `DUO_INTEGRATION_KEY`, and `DUO_SECRET_KEY`.
- Users enrolled in Duo with the Ory identity ID as their Duo username. This handler doesn't enroll users.
- A deployment target for the webhook handler.

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill ORY_WEBHOOK_SECRET, DUO_API_HOST, DUO_INTEGRATION_KEY, DUO_SECRET_KEY.
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /duo/verify` — Ory Action target.

## Configure Ory

1. Encode the body template with `base64 < jsonnet/identity.jsonnet | tr -d '\n'` and put the result in the `body` of the hook in [`ory-actions.yaml`](ory-actions.yaml).
2. Merge [`ory-actions.yaml`](ory-actions.yaml) into the identity configuration. It puts the hook in `selfservice.flows.login.after.password.hooks` with `response.parse: true` and aliases that list into the `oidc`, `code`, `passkey`, and `webauthn` lists. Add any other login method you enable, such as `saml`, the same way. Ory Kratos Identities runs the global `selfservice.flows.login.after.hooks` list only for a method that has no hooks of its own.
3. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value in the hook config.
4. In your login UI, send the code in the flow's `transient_payload` as ``duo_passcode``.

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match `X-Webhook-Secret` in the Ory hook config.
- **"Duo verification is unavailable"** — the Duo call failed. Check the handler log. A `401` from Duo with `Invalid signature` usually means clock drift between the handler and Duo; run NTP on the handler host.
- **Every sign-in is denied** — the Duo username doesn't match. Duo users must be enrolled with the Ory identity ID as username.
- **"Enter your Duo passcode"** — the login UI didn't send `duo_passcode` in `transient_payload`.

## License

Apache-2.0. SPDX header at the top of each source file.
