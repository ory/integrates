# Microsoft Dynamics 365

> **Maintained by:** Community contributors

[Microsoft Dynamics 365](https://www.microsoft.com/en-us/dynamics-365) is an enterprise CRM and ERP platform. This integration syncs Ory identities to Dynamics 365 Contact records via the Dataverse Web API (OData v4) using an Ory Action webhook. When a user registers or updates their profile, the handler creates or upserts the corresponding Dynamics Contact keyed by an `ory_identity_id` alternate key.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrations/crm/microsoft-dynamics-365](https://ory.com/docs/integrations/crm/microsoft-dynamics-365)

## Use case

An enterprise running Microsoft Dynamics 365 as its CRM wants every Ory-managed identity mirrored to a Contact record, with the Ory identity id stored on an alternate key so any system can reverse-lookup. The integration runs at registration and settings time, idempotently upserting via Dataverse's PATCH-on-alternate-key pattern so retries never duplicate.

## How it works

1. A user registers or updates their profile in an Ory flow.
2. Ory fires the sync (or async) Action webhook to this handler. The handler verifies the shared secret.
3. The handler exchanges its Entra ID client credentials for an OAuth2 access token (cached, refreshed 5 min before expiry) scoped to `${DYNAMICS_RESOURCE_URL}/.default`.
4. The handler upserts the contact via `PATCH /api/data/v9.2/contacts(ory_identity_id='<id>')` with `If-Match: *`. Dataverse routes the request to the alternate key and creates the row if missing.
5. The handler returns `200` to Ory.

## Prerequisites

- An Ory Network project.
- A Dynamics 365 environment URL (`https://<org>.crm.dynamics.com`).
- A Microsoft Entra ID **app registration** for client_credentials, with a corresponding **application user** added inside Dynamics and assigned a security role that can create/update Contacts.
- An `ory_identity_id` **alternate key** on the Contact table in Dataverse.
- A deployment target for the webhook handler.

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill ORY_WEBHOOK_SECRET, DYNAMICS_RESOURCE_URL, ENTRA_TENANT_ID,
# ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET.
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /dynamics/sync-user` — Ory Action target.

## Configure Ory

1. Configure the Action hook using the snippet in [`ory-actions.yaml`](ory-actions.yaml) — register on `after:registration` and `after:settings`.
2. The body template is [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet). The default destructures `name.first`, `name.last`, and `phone` from traits — adjust if your identity schema uses different keys.
3. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value in the hook config.

Entra app registration, Dynamics application-user setup, and alternate-key indexing: see the [docs page](https://ory.com/docs/integrations/crm/microsoft-dynamics-365).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match `X-Webhook-Secret` in the Ory hook config.
- **`401` from Dataverse** — the Entra app isn't added as an Application User inside Dynamics, or the assigned security role lacks Contact write. App-permission alone isn't sufficient.
- **`404` on PATCH** — the `ory_identity_id` alternate key isn't configured or hasn't finished indexing. The alternate-key route returns 404 until the index job completes.
- **`412 Precondition Failed`** — `If-Match: *` header is required for upsert. Without it Dataverse rejects the PATCH on existing rows.
- **`entra token 401 AADSTS7000215`** — `ENTRA_CLIENT_SECRET` is invalid or expired. Regenerate in Entra → app → Certificates & secrets.

## License

Apache-2.0. SPDX header at the top of each source file.
