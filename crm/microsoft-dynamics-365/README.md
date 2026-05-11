# Microsoft Dynamics 365 — Ory Network Integration

> **Maintained by:** Community contributors

## Overview

Microsoft Dynamics 365 is a major enterprise CRM and ERP platform. This integration syncs Ory identities to Dynamics 365 contact records via the Dataverse Web API (OData v4) using an Ory Actions webhook. When a user registers or updates their profile, the handler creates or upserts the corresponding Dynamics contact.

## How it works

```
User registers in Ory UI
        ↓
Ory Action webhook → POST /dynamics/sync-user
        ↓
Handler authenticates request (X-Webhook-Secret)
        ↓
Handler exchanges Entra ID client credentials for an OAuth 2.0 token
(cached ~55 min)
        ↓
Handler upserts the contact via Dataverse Web API
PATCH /api/data/v9.2/contacts(ory_identity_id='<id>') with If-Match: *
        ↓
Handler returns 200 to Ory
```

The integration uses an **alternate key** in Dataverse (`ory_identity_id`) to make the upsert idempotent. Configure that alternate key on the Contact entity before deploying — see Setup → Step 2 below.

## Prerequisites

- Ory Network project
- Dynamics 365 environment URL (`https://<org>.crm.dynamics.com`)
- Microsoft Entra ID app registration with delegated `Dataverse.user_impersonation` or application-level access to your Dynamics environment
- Permission to add an alternate key on the Contact entity

## Setup

### 1. Register the Entra ID app

In Microsoft Entra ID admin center:

1. **App registrations → New registration.** Single tenant is fine.
2. **API permissions → Add permission → Dynamics CRM → user_impersonation** (delegated) **or** assign the app a Dynamics security role for application access (recommended for daemon use).
3. **Certificates & secrets → New client secret.** Note `client_id` and `client_secret`.
4. **In Dynamics:** Settings → Security → Application Users → New. Add the Entra app as an application user and assign a security role with Contact create/update permissions.

### 2. Create the `ory_identity_id` alternate key on the Contact entity

In Power Apps maker portal:

1. **Tables → Contact → Keys → New key.**
2. Add a column `ory_identity_id` (Text, unique) if it doesn't already exist.
3. Mark it as the **Alternate Key**. Wait for the index job to finish.

This is what makes the `PATCH /contacts(ory_identity_id='<id>')` upsert work.

### 3. Deploy the handler

```bash
cd webhook/
cp .env.example .env
# Fill DYNAMICS_RESOURCE_URL, ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET,
# ORY_WEBHOOK_SECRET
npm install
node server.js
```

Endpoints:

- `GET /health` — readiness check
- `POST /dynamics/sync-user` — Ory Action target

## Configure Ory

1. Register the webhook with [`ory-actions.yaml`](ory-actions.yaml) on `after registration` and `after settings`.
2. Body template: [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet).

## Troubleshooting

- **`401` from Dataverse** — the application user wasn't added inside Dynamics, or the security role lacks Contact write. The Entra app permission alone isn't sufficient.
- **`404` on PATCH** — the `ory_identity_id` alternate key isn't configured or hasn't finished indexing. Until the index job completes, the alternate-key route returns 404.
- **`412 Precondition Failed`** — `If-Match: *` is required for upsert. Without it Dataverse will reject the PATCH on existing rows.
- **Token expiry storms** — handler caches the token; increase `cachedExpiry` buffer if you see token-refresh stampedes under load.

## Resources

- [Dataverse Web API reference](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/use-microsoft-dataverse-web-api)
- [Define alternate keys for entities](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/define-alternate-keys-entity)
- [Ory Actions and webhooks](https://www.ory.com/docs/actions/web-hook)
