# Zendesk

> **Maintained by:** Community contributors

[Zendesk](https://zendesk.com) is a customer-service platform that handles ticketing, live chat, and knowledge bases. This integration syncs Ory identities to Zendesk users so support agents see identity context (subscription plan, MFA status, risk score, recent sessions) in the agent sidebar, and so tickets correlate cleanly back to the user's Ory identity.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrations/support-helpdesk/zendesk](https://ory.com/docs/integrations/support-helpdesk/zendesk)

## Use case

A B2B SaaS support team wants the Zendesk agent view to surface "who is this customer" without leaving the ticket: which plan, whether MFA is on, how many active sessions, when they last logged in. This integration ships two pieces: an async user-sync that keeps Zendesk users mirrored to Ory identities, and a sidebar lookup endpoint a Zendesk app can call to render identity context inline on every ticket.

## How it works

1. A user registers or updates their profile through an Ory flow.
2. Ory fires an async post-flow Action webhook to this handler (one for `registration`, one for `settings`).
3. The handler returns `200` to Ory immediately. In the background, it calls Zendesk `POST /api/v2/users/create_or_update` to create or merge the corresponding Zendesk user, copying the Ory `identity.id` into `external_id` and a few selected fields (subscription plan, risk score) into Zendesk `user_fields`.
4. When an agent opens a ticket in Zendesk, a Zendesk sidebar app calls `GET /zendesk/sidebar/identity?email=…` on this handler. The handler authenticates the sidebar with a separate shared secret, queries Ory's Admin API for the identity and its active sessions, and returns a compact payload the sidebar renders inline.

## Prerequisites

- An Ory Network project and an admin API key with identity-read scope (Ory Console → API Keys).
- A Zendesk Suite (Support) account with admin access, a Zendesk API token, and your Zendesk subdomain.
- The Zendesk CLI ([`@zendesk/zcli`](https://www.npmjs.com/package/@zendesk/zcli)) for building and uploading the sidebar app (`zcli` replaces the older `zat`).
- A deployment target for the webhook handler (any Node.js runtime: Cloud Run, Heroku, Vercel, Lambda behind API Gateway, your own VM).

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill in ORY_WEBHOOK_SECRET, ZENDESK_SUBDOMAIN/EMAIL/API_TOKEN, ORY_SDK_URL,
# ORY_ADMIN_API_KEY, ZENDESK_SIDEBAR_SECRET.
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /zendesk/registration` — Ory async post-registration target.
- `POST /zendesk/settings` — Ory async post-settings target.
- `GET /zendesk/sidebar/identity?email=…` — Zendesk app sidebar lookup, gated by `X-Zendesk-Secret`.

## Configure Ory

1. In the Ory Console, configure the two Action hooks using the snippets in [`ory-actions.yaml`](ory-actions.yaml) (post-registration and post-settings).
2. The body template is [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet) — shared by both hooks.
3. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value declared in the hook config.
4. Set `ZENDESK_SIDEBAR_SECRET` to a separate long random value and configure your Zendesk sidebar app to send it as the `X-Zendesk-Secret` header.

Sidebar app manifest, `iframe.html` source, agent-side rendering, and Zendesk app upload steps: see the [docs page](https://ory.com/docs/integrations/support-helpdesk/zendesk).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match `X-Webhook-Secret` in the Ory hook config.
- **`401 invalid sidebar secret`** — the Zendesk sidebar app is sending the wrong (or no) `X-Zendesk-Secret` header.
- **Zendesk users not appearing** — the API token is invalid, the admin email is wrong, or the user lacks the Admin role. Check handler logs for `Zendesk 401/403`.
- **Sidebar always says "not found"** — Zendesk ticket requester email doesn't match the Ory credential identifier. Confirm both sides are using the same email casing.
- **`502 ory_lookup_failed`** — `ORY_SDK_URL` is wrong or `ORY_ADMIN_API_KEY` lacks identity-read scope.

## License

Apache-2.0. SPDX header at the top of each source file.
