# Equifax

> **Maintained by:** Community contributors

[Equifax](https://www.equifax.com) is a global credit bureau that provides credit-anchored identity verification through its Digital Identity Trust APIs. This integration calls Equifax from an Ory Action webhook during registration to verify the user's identity attributes against credit-bureau data and rejects the registration unless Equifax returns a passing decision.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrates-with/identity-verification/equifax](https://www.ory.com/docs/integrates-with/identity-verification/equifax)

## Use case

A regulated B2C product (fintech, lending, insurance) needs credit-anchored identity proofing on every signup to satisfy KYC requirements. Equifax's Digital Identity Trust APIs return a deterministic decision and a confidence score; the integration runs this lookup inline with Ory registration so high-confidence identities pass through and low-confidence ones can be blocked or routed to step-up verification.

## How it works

1. A user completes the registration form, providing the identity attributes Equifax needs (first name, last name, date of birth, optional SSN last 4, address).
2. Ory calls this handler from a registration action with `response.parse: true`, before it saves the identity. The handler verifies the shared secret.
3. The handler exchanges its Equifax OAuth2 client credentials for an access token using the configured `EQUIFAX_SCOPE` and caches it (refresh ~5 minutes before expiry to amortize the round-trip).
4. The handler calls Equifax's identity-verification endpoint with the consumer payload built from the identity traits.
5. The handler applies your policy. Ory doesn't interpret vendor decisions, and any `200` lets the registration through:
   - **Pass** (`decision` or `outcome` in `EQUIFAX_PASS_DECISIONS`, default `APPROVE,PASS,ACCEPT`): `200` with `{"identity": {"external_id": "<reference>", "metadata_admin": {"equifax_verification_status": "verified", ...}}}`. Ory saves both with the new identity.
   - **Anything else:** `400` with a `messages` body, which rejects the registration.

   Set `EQUIFAX_PASS_DECISIONS` to the passing decision values of your Equifax product.

## Prerequisites

- An Ory Network project.
- An Equifax developer account at [developer.equifax.com](https://developer.equifax.com) with an entitled product (Identity Verification, Digital Identity Trust, etc.) — Equifax onboarding is gated and requires legal review.
- OAuth2 client credentials (`client_id`, `client_secret`) and the product `scope`.
- A deployment target for the webhook handler (any Node.js runtime: Cloud Run, Heroku, Vercel, Lambda behind API Gateway, your own VM).

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill ORY_WEBHOOK_SECRET, EQUIFAX_API_BASE, EQUIFAX_CLIENT_ID,
# EQUIFAX_CLIENT_SECRET, EQUIFAX_SCOPE.
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /equifax/verify-identity` — Ory Action target.

## Configure Ory

1. Configure the action using the snippet in [`ory-actions.yaml`](ory-actions.yaml).
2. The body template is [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet) — Equifax verification typically needs `first_name`, `last_name`, `date_of_birth`, `ssn_last_four`, and `address`. Extend the identity schema to carry those fields if they aren't already present.
3. Keep `response.parse: true` so the handler can reject the registration and return metadata.
4. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value declared in the hook config.

- Put the hook in the method-specific list, such as `selfservice.flows.registration.after.password.hooks`, and repeat it for every method you enable, such as `oidc` or `code`. Ory runs the global `registration.after.hooks` list only for a method that has no hooks of its own. Keep the `session` hook last.
- `body: file://./jsonnet/...` works for self-hosted Ory Kratos. On Ory Network, encode the template with `base64 < jsonnet/identity.jsonnet | tr -d '\n'` and set `body: base64://<encoded>`.
- With `response.parse: true`, the action runs before the identity is saved, so `ctx.identity.id` is `00000000-0000-0000-0000-000000000000`. The handler sends its own reference to the vendor and returns it as the identity's `external_id`; look the identity up later with `GET /admin/identities/by/external/<reference>`.
- Ory waits about 30 seconds for the handler and retries a `5xx` response (three attempts in total).

To reject the flow, the handler responds with a `4xx` status code and this body. Ory shows the `text` to the user:

```json
{
  "messages": [
    {
      "instance_ptr": "#/",
      "messages": [{ "id": 9000102, "text": "We couldn't verify your identity.", "type": "error" }]
    }
  ]
}
```

Detailed setup, identity-schema extensions for KYC fields, and per-product Equifax scopes: see the [docs page](https://ory.com/docs/integrates-with/identity-verification/equifax).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match the `X-Webhook-Secret` value in the Ory hook config.
- **`equifax token 401`** — the `EQUIFAX_SCOPE` doesn't match the product you've been entitled to in the Equifax developer portal. The scope is product-specific.
- **Sandbox vs production** — sandbox uses `https://api.sandbox.equifax.com`; production uses `https://api.equifax.com`. Mixing credentials and base URLs returns `401`.
- **`502 verify_failed`** — Equifax API returned non-2xx. Check handler logs for the response body; common causes are malformed `consumer` payload (missing required fields) or product entitlement issues.
- **PII in logs** — Equifax responses can include sensitive matched attributes. Strip them from logs before shipping to your SIEM.

## License

Apache-2.0. SPDX header at the top of each source file.
