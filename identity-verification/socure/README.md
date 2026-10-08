# Socure

> **Maintained by:** Community contributors

[Socure](https://socure.com) is an ML-based identity verification platform with strong fraud detection and KYC coverage. This integration calls Socure ID+ from an Ory Action webhook during registration and (optionally) consumes Socure's async result callback to write the final decision back to the identity.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrates-with/identity-verification/socure](https://www.ory.com/docs/integrates-with/identity-verification/socure)

## Use case

A regulated B2C product needs ML-driven identity verification at signup with strong fraud signals (device fingerprint, email reputation, network risk). Socure's ID+ runs the configured modules (KYC, fraud, phonerisk) inline and either returns an immediate verdict or — for slow flows — sends one asynchronously when its risk pipelines finish. The integration handles both paths from a single deployment.

## How it works

1. **Synchronous path** — A user completes registration; Ory calls `POST /socure/verify-identity` from a registration action with `response.parse: true`, before it saves the identity. The handler verifies the shared secret and calls Socure ID+ (`POST /api/3.0/EmailAuthScore`) with the configured `SOCURE_MODULES` and its own reference as `customerUserId`. The handler applies the policy: when Socure's `decision.value` is `reject`, or the first fraud score is at or above `SOCURE_FRAUD_THRESHOLD` (default `0.9`), it responds `400` with a `messages` body and Ory rejects the registration. Otherwise it responds `200` with `{"identity": {"external_id": "<reference>", "metadata_public": {"socure_verification_status": ...}}}`. Any `200` lets the registration through.
2. **Asynchronous path** — When Socure is configured to send async results (long-running checks), Socure POSTs to `/socure/results-callback` with an HMAC-SHA256 signature over the raw body in `X-Socure-Signature`. The handler verifies the signature, finds the identity with `GET /admin/identities/by/external/<customerUserId>` and writes the final `decision` to `metadata_public.socure_decision`. It returns 2xx only after the write succeeds, so Socure retries a failed delivery.

## Prerequisites

- An Ory Network project. Optionally an admin API key with identity-write scope (for the async write-back).
- A Socure account with an SDK key (`SOCURE_API_KEY`) and the modules you want to run (commonly `kyc`, `fraud`, `phonerisk`).
- A publicly reachable URL for `/socure/results-callback` if you use the async path; configure it plus a signing secret in Socure Admin → Webhooks.
- A deployment target for the webhook handler (any Node.js runtime: Cloud Run, Heroku, Vercel, Lambda behind API Gateway, your own VM).

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill ORY_WEBHOOK_SECRET, SOCURE_API_KEY, SOCURE_MODULES, and (for async)
# SOCURE_CALLBACK_SECRET + ORY_SDK_URL + ORY_ADMIN_API_KEY.
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /socure/verify-identity` — sync Ory Action target.
- `POST /socure/results-callback` — Socure async result webhook (gated by `X-Socure-Signature` HMAC). Returns `503` when `SOCURE_CALLBACK_SECRET` is unset.

## Configure Ory

1. In the Ory Console, configure the sync Action hook using the snippet in [`ory-actions.yaml`](ory-actions.yaml).
2. The body template is [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet). Socure benefits from a `device_session_id` collected client-side via the Socure SDK; pass it through `transient_payload.device_session_id` or `identity.traits.socure_device_session_id`.
3. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value declared in the hook config.
4. For the async callback path, configure the callback URL and signing secret in Socure Admin → Webhooks, and put the same secret in `SOCURE_CALLBACK_SECRET`, `ORY_SDK_URL`, and `ORY_ADMIN_API_KEY`. The callback returns 503 until all three are set.

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
      "messages": [{ "id": 9000302, "text": "We couldn't verify your identity.", "type": "error" }]
    }
  ]
}
```

Identity-schema extensions for KYC fields, Socure module configuration, and per-module decision interpretation: see the [docs page](https://ory.com/docs/integrates-with/identity-verification/socure).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match `X-Webhook-Secret` in the Ory hook config.
- **`401 invalid signature` on `/socure/results-callback`** — `SOCURE_CALLBACK_SECRET` doesn't match the value configured in Socure, or the body parser stripped bytes. The HMAC is over the raw body.
- **`Socure 401`** in handler logs — `SOCURE_API_KEY` is wrong (note: the header name `SocureApiKey` is camelCase per Socure's spec — not a typo).
- **Modules not running** — module names are case-sensitive in the request body; verify `SOCURE_MODULES` matches Socure's documentation exactly.
- **`device_session_id` missing** — only available if you instrument the Socure JS SDK on the client. Without it, fraud signals are weaker but the call still works.
- **`callback_disabled`** response on the async endpoint — `SOCURE_CALLBACK_SECRET` is unset; set it (or skip the async path entirely).

## License

Apache-2.0. SPDX header at the top of each source file.
