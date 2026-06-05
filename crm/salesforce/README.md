# Salesforce (CRM)

> **Maintained by:** Community contributors

Sync Ory identities to Salesforce as **Leads or Contacts** via Ory Actions webhooks, calling the Salesforce REST API with OAuth2 service-to-service authentication.

> This is the **CRM-side** Salesforce integration (registry name: `salesforce-crm`). For Salesforce as a **sign-in provider**, see [`social-sign-in/salesforce`](../../social-sign-in/salesforce/) — different integration, different audience.

**Type:** config (Ory Action wiring + Jsonnet body — no first-party webhook handler ships here)
**Docs page:** [ory.com/docs/integrates-with/crm/salesforce](https://www.ory.com/docs/integrates-with/crm/salesforce)

## How it works

1. User completes registration / profile update in your Ory-powered application.
2. Ory fires an Action on `registration.after` / `settings.after` (typically async).
3. The Action's body Jsonnet calls Salesforce's REST API directly (`POST /services/data/vXX.0/sobjects/Lead/` or `Contact/`) using a stored Salesforce OAuth2 access token.

## Setup outline

1. In Salesforce → **Setup** → **App Manager** → **New Connected App**:
   - Enable **OAuth Settings** with the **Client Credentials Flow** (server-to-server).
   - Add OAuth scopes: `api` (basic REST API access).
   - Note the **Consumer Key** and **Consumer Secret**.
2. Configure a Salesforce **Permission Set** that grants the connected app permission to create the chosen object (Lead or Contact); assign it to the integration user.
3. Configure an Ory Action on `registration.after` (and/or `settings.after`) — the body Jsonnet builds the Salesforce payload and the `auth` block points at Salesforce's token endpoint for the access token.
4. Best practice: deploy a small token-broker service that handles OAuth2 token refresh and returns a short-lived bearer token to Ory; pointing Ory directly at the Salesforce token endpoint is possible but operationally fragile.

## Notable

- **Lead vs Contact** — start with Lead; promote to Contact when the user converts (typically via Salesforce-side automation, not Ory).
- Salesforce edition matters — Connected Apps and Permission Sets require **Enterprise** or higher; **Professional** edition may not support all API features.
- Per-object API limits apply (Salesforce daily API call limit varies by edition); high-volume signup flows may need batch creation rather than per-event calls.

## Status

Community / proposed — no dedicated Ory documentation, no first-party webhook handler ships in this directory. Wiring is Ory Action config + Jsonnet.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
