# HubSpot CRM Integration

> **Maintained by:** Ory Engineering

Sync Ory identities to HubSpot contacts. When a user registers or updates their profile in your Ory-powered application, this integration creates or updates the corresponding contact in HubSpot CRM.

**Docs page:** [ory.com/docs/integrations/hubspot](https://ory.com/docs/integrations/hubspot)

## Use case

You're using Ory for authentication and want your sales/marketing team to see new sign-ups in HubSpot in near-real-time, without manually exporting users.

## How it works

1. A user registers in your Ory-powered application.
2. Ory fires a webhook to this integration's `/hubspot/sync-user` endpoint.
3. The handler authenticates with HubSpot using a private app token.
4. The handler creates or updates the matching HubSpot contact, using email as the unique key.

## Prerequisites

- An Ory Network project
- A HubSpot account with a private app token (Settings → Integrations → Private Apps → Create a private app). Required scopes: `crm.objects.contacts.read` and `crm.objects.contacts.write`.
- A Node.js 20+ deployment target

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill in HUBSPOT_PRIVATE_APP_TOKEN, ORY_WEBHOOK_SECRET, and PORT
npm install
node server.js
```

The handler exposes:
- `GET /health` — readiness check
- `POST /hubspot/sync-user` — Ory webhook target

## Configure Ory

1. In the Ory Console, configure a registration post-hook using the snippet in [`ory-actions.yaml`](ory-actions.yaml).
2. The body template is [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet) — it forwards the identity payload to the handler.

Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value declared in the Ory hook config.

## Troubleshooting

- **401 from the handler** — `X-Webhook-Secret` mismatch.
- **HubSpot 401** — private app token expired or scopes missing.
- **Contact not appearing in HubSpot** — confirm the handler logs show a 2xx response from HubSpot. If yes, check the HubSpot UI filter (sometimes new contacts land in a default segment that's filtered out of the main view).

## License

Apache-2.0.
