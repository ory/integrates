# Salesforce (CRM)

> **Maintained by:** Community contributors

Sync Ory identities to Salesforce as **Leads or Contacts** with Ory Actions webhooks. A handler that you deploy calls the Salesforce REST API with OAuth2 service-to-service authentication.

> This is the **CRM-side** Salesforce integration (registry name: `salesforce-crm`). For Salesforce as a **sign-in provider**, see [`social-sign-in/salesforce`](../../social-sign-in/salesforce/) — different integration, different audience.

**Type:** config (Ory Action wiring + Jsonnet body; you deploy the handler — none ships here)
**Docs page:** [ory.com/docs/integrates-with/crm/salesforce](https://www.ory.com/docs/integrates-with/crm/salesforce)

## How it works

1. User completes registration / profile update in your Ory-powered application.
2. Ory fires an asynchronous Action (`response.ignore: true`) from the method-specific lists, for example `selfservice.flows.registration.after.password.hooks` and `selfservice.flows.settings.after.profile.hooks`, and sends the identity to your handler. The body Jsonnet only shapes this request; it can't call other APIs.
3. The handler gets a Salesforce access token with the OAuth2 client credentials flow, reuses it until it expires, and calls Salesforce's REST API (`POST /services/data/vXX.0/sobjects/Lead/` or `Contact/`).

Ory webhooks authenticate only with `api_key` or `basic_auth`, so Ory can't fetch a Salesforce token itself.

## Setup outline

1. In Salesforce → **Setup** → **App Manager** → **New Connected App**:
   - Enable **OAuth Settings** with the **Client Credentials Flow** (server-to-server).
   - Add OAuth scopes: `api` (basic REST API access).
   - Note the **Consumer Key** and **Consumer Secret**.
2. Configure a Salesforce **Permission Set** that grants the connected app permission to create the chosen object (Lead or Contact); assign it to the integration user.
3. Deploy the handler with the Consumer Key and Consumer Secret. Protect it with a shared secret that Ory sends through `api_key` auth, for example in an `X-Webhook-Secret` header.
4. Configure an Ory Action that points at the handler in the registration method lists, such as `selfservice.flows.registration.after.password.hooks` and `selfservice.flows.registration.after.oidc.hooks`, and in `selfservice.flows.settings.after.profile.hooks` if you also sync profile updates. Attach the action explicitly to each registration method you enable; on Ory Network, keep `session` last in the `password` list. See [Attach `after` actions to authentication methods](https://www.ory.com/docs/kratos/hooks/configure-hooks#attach-after-actions-to-authentication-methods).

## Notable

- **Lead vs Contact** — start with Lead; promote to Contact when the user converts (typically via Salesforce-side automation, not Ory).
- Salesforce edition matters — Connected Apps and Permission Sets require **Enterprise** or higher; **Professional** edition may not support all API features.
- Per-object API limits apply (Salesforce daily API call limit varies by edition); high-volume signup flows may need batch creation rather than per-event calls.

## Status

Community / proposed — no first-party webhook handler ships in this directory. Wiring is Ory Action config + Jsonnet, plus a handler you deploy.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
