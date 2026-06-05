# HubSpot

> **Maintained by:** Ory Engineering

[HubSpot](https://hubspot.com) is a CRM, marketing, and sales platform. This integration syncs Ory identities to HubSpot CRM contacts via an Ory Action webhook — on registration or profile update, the handler creates the corresponding HubSpot contact, or PATCHes the existing one on `409 Existing ID:` so the sync is idempotent.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrates-with/crm/hubspot](https://www.ory.com/docs/integrates-with/crm/hubspot) — full guide: [ory.com/docs/actions/integrations/hubspot](https://www.ory.com/docs/actions/integrations/hubspot)

## Use case

A sales/marketing team running HubSpot wants every Ory-managed sign-up to land in HubSpot CRM in near-real-time, with the Ory identity id stored on a custom property so any system can reverse-lookup. The integration runs at registration and settings time, idempotently upserting the contact via HubSpot's `409 Existing ID` pattern.

## How it works

1. A user registers or updates their profile in an Ory flow.
2. Ory fires the Action webhook to this handler. The handler verifies the shared secret.
3. The handler POSTs `https://api.hubapi.com/crm/v3/objects/contacts` with `email`, `firstname`, `lastname`, `ory_identity_id`.
4. If HubSpot returns `409` because the contact already exists, the handler parses the existing ID out of HubSpot's error message and PATCHes the same properties onto that contact — idempotent upsert.
5. The handler returns `200` to Ory.

## Prerequisites

- An Ory Network project.
- A HubSpot account with a **private app token** (Settings → Integrations → Private Apps). Required scopes: `crm.objects.contacts.read` and `crm.objects.contacts.write`.
- An `ory_identity_id` custom property on the HubSpot Contact object (HubSpot → Settings → Properties → Contacts → Create property).
- A deployment target for the webhook handler.

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill ORY_WEBHOOK_SECRET and HUBSPOT_PRIVATE_APP_TOKEN.
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /hubspot/sync-user` — Ory Action target.

## Configure Ory

1. Configure the Action hook using the snippet in [`ory-actions.yaml`](ory-actions.yaml) — register on `after:registration` and (optionally) `after:settings`.
2. The body template is [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet).
3. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value in the hook config.

Private app provisioning, custom-property setup, and HubSpot workflow patterns: see the [docs page](https://ory.com/docs/integrates-with/crm/hubspot).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` doesn't match `X-Webhook-Secret` in the Ory Action config.
- **`HubSpot 401`** — private app token is invalid or doesn't have the right scopes. Confirm `crm.objects.contacts.read` and `crm.objects.contacts.write`.
- **Contact not appearing in HubSpot main view** — new contacts can land in a default lifecycle segment that's filtered out of the default view. Check the underlying contact list, not the filtered "active" view.
- **`502 hubspot_error` on PATCH after 409** — the existing-ID parser couldn't extract the ID from HubSpot's error message format. HubSpot occasionally changes the message text; fall back to a search-by-email call if this happens.

## License

Apache-2.0. SPDX header at the top of each source file.
