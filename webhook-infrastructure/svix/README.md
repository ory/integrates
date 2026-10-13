# Svix

> **Maintained by:** Community contributors

[Svix](https://svix.com) is a managed webhook-delivery platform that handles fan-out, retries, signing, delivery monitoring, and replay. This integration routes Ory identity-flow events through Svix so multiple downstream consumers (CRM, billing, analytics, your customers' webhooks) can subscribe to Ory events with operational guarantees Ory itself doesn't provide directly.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrates-with/webhook-infrastructure/svix](https://www.ory.com/docs/integrates-with/webhook-infrastructure/svix)

## Use case

A platform product wants to expose identity-lifecycle events (registered, logged in, updated, recovered, verified) to its own customers as webhooks, but doesn't want to build webhook plumbing — retries, exponential backoff, replay, per-endpoint signing, dashboards, alerts. Ory Actions fire on the events; this router relays them to Svix, which fans out to consumer endpoints with at-least-once delivery and a managed monitoring surface.

## How it works

1. A user completes a registration, login, settings, recovery, or verification flow in Ory.
2. Ory fires the post-flow Action webhook to this handler (`/svix/registration`, `/svix/login`, etc.) in the background (`response.ignore: true`), so the flow doesn't wait. The handler verifies the shared secret.
3. The handler builds a Svix message payload. The client IP address comes from the `True-Client-Ip` request header that Ory Network sets; Ory doesn't forward `X-Forwarded-For` to webhooks.
4. The handler POSTs to `${SVIX_API_BASE}/api/v1/app/${SVIX_APP_ID}/msg/` with `Authorization: Bearer ${SVIX_API_KEY}`. The message carries an `eventType` (e.g. `ory.identity.registered`) and a deterministic `eventId` of `ory-<eventType>-<flowId>` so retries are idempotent at the Svix layer.
5. Svix fans the event out to every consumer endpoint subscribed to that event type, retries failures on its standard exponential schedule, signs each delivery with the endpoint's secret, and surfaces delivery health in the dashboard.

The handler responds with `200` only after the vendor accepts the event. It returns `502` on delivery failure so Ory can retry; the user flow still does not wait because the action uses `response.ignore: true`. Ory's retries are bounded. Use a durable queue if events must survive longer outages.

## Prerequisites

- A Svix account ([api.svix.com](https://www.svix.com)) — or a self-hosted Svix instance — and an API key.
- A Svix application created for this Ory project (one per project recommended).
- An Ory Network project.
- A deployment target for the webhook handler (any Node.js runtime: Cloud Run, Heroku, Vercel, Lambda behind API Gateway, your own VM).

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill in ORY_WEBHOOK_SECRET, SVIX_API_KEY, SVIX_APP_ID.
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /svix/registration` — publishes `ory.identity.registered`.
- `POST /svix/login` — publishes `ory.identity.logged_in`.
- `POST /svix/settings` — publishes `ory.identity.updated`.
- `POST /svix/recovery` — publishes `ory.identity.recovered`.
- `POST /svix/verification` — publishes `ory.identity.verified`.

## Configure Ory

1. Configure the five Action hooks using the snippets in [`ory-actions.yaml`](ory-actions.yaml). Registration and login actions go in the method-specific lists, for example `selfservice.flows.registration.after.password.hooks`; repeat them for every method you enable, such as `oidc`, `code`, or `passkey`. Ory runs the flow-level `after.hooks` list only for a method without its own list, and on Ory Network the password registration list already contains `session`, so keep `session` last. Profile changes use `selfservice.flows.settings.after.profile.hooks`. Recovery and verification have only flow-level lists.
2. The body template is [`jsonnet/event.jsonnet`](jsonnet/event.jsonnet), shared by all five hooks. Encode it with `base64 < jsonnet/event.jsonnet | tr -d '\n'` and set `body: base64://<encoded>`; Ory Network doesn't accept `file://` URLs. The webhook context never contains `metadata_admin`; a template that reads it fails and Ory drops the request.
3. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value declared in the hook config.
4. Register the five event types in Svix (one-time) and add consumer endpoints — covered in the [docs page](https://www.ory.com/docs/integrates-with/webhook-infrastructure/svix).

Ory retries a delivery that fails or receives `429` or a `5xx` status other than `501`, up to three attempts within a few seconds. Svix adds durable retries and replay from the handler onward.

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match the `X-Webhook-Secret` value in the Ory hook config.
- **`Svix 401`** in handler logs — `SVIX_API_KEY` is invalid or revoked.
- **`Svix 404`** — `SVIX_APP_ID` doesn't exist in your Svix account. Create it via `svix application create` or the API.
- **`Svix 422`** — the event type isn't registered in Svix. Register `ory.identity.{registered, logged_in, updated, recovered, verified}` in Svix admin.
- **Consumers never receive events** — confirm consumer endpoints in Svix have `filterTypes` covering the event types you're publishing (or no filter at all to receive everything).

## License

Apache-2.0. SPDX header at the top of each source file.
