# Svix

> **Maintained by:** Community contributors

[Svix](https://svix.com) is a managed webhook-delivery platform that handles fan-out, retries, signing, delivery monitoring, and replay. This integration routes Ory identity-flow events through Svix so multiple downstream consumers (CRM, billing, analytics, your customers' webhooks) can subscribe to Ory events with operational guarantees Ory itself doesn't provide directly.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrates-with/webhook-infrastructure/svix](https://www.ory.com/docs/integrates-with/webhook-infrastructure/svix)

## Use case

A platform product wants to expose identity-lifecycle events (`user.registered`, `user.logged_in`, `user.updated`, `user.verified`) to its own customers as webhooks, but doesn't want to build webhook plumbing — retries, exponential backoff, replay, per-endpoint signing, dashboards, alerts. Ory Actions fire on the events; this router relays them to Svix, which fans out to consumer endpoints with at-least-once delivery and a managed monitoring surface.

## How it works

1. A user completes a registration, login, settings, recovery, or verification flow in Ory.
2. Ory fires the async post-flow Action webhook to this handler (`/svix/registration`, `/svix/login`, etc.). The handler verifies the shared secret.
3. The handler returns `200` to Ory immediately and builds a Svix message payload in the background.
4. The handler POSTs to `${SVIX_API_BASE}/api/v1/app/${SVIX_APP_ID}/msg/` with `Authorization: Bearer ${SVIX_API_KEY}`. The message carries an `eventType` (e.g. `ory.identity.registered`) and a deterministic `eventId` of `ory-<eventType>-<flowId>` so retries are idempotent at the Svix layer.
5. Svix fans the event out to every consumer endpoint subscribed to that event type, retries failures on its standard exponential schedule, signs each delivery with the endpoint's secret, and surfaces delivery health in the dashboard.

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
- `POST /svix/recovery` — publishes `ory.identity.recovery_initiated`.
- `POST /svix/verification` — publishes `ory.identity.verified`.

## Configure Ory

1. In the Ory Console, configure the five Action hooks using the snippets in [`ory-actions.yaml`](ory-actions.yaml).
2. The body template is [`jsonnet/event.jsonnet`](jsonnet/event.jsonnet) — shared by all five hooks.
3. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value declared in the hook config.
4. Register the five event types in Svix (one-time) and add consumer endpoints — covered in the [docs page](https://ory.com/docs/integrates-with/webhook-infrastructure/svix).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match the `X-Webhook-Secret` value in the Ory hook config.
- **`Svix 401`** in handler logs — `SVIX_API_KEY` is invalid or revoked.
- **`Svix 404`** — `SVIX_APP_ID` doesn't exist in your Svix account. Create it via `svix application create` or the API.
- **`Svix 422`** — the event type isn't registered in Svix. Register `ory.identity.{registered, logged_in, updated, recovery_initiated, verified}` in Svix admin.
- **Consumers never receive events** — confirm consumer endpoints in Svix have `filterTypes` covering the event types you're publishing (or no filter at all to receive everything).

## License

Apache-2.0. SPDX header at the top of each source file.
