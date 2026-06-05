# Salesforce

> **Maintained by:** Ory Engineering

Add Salesforce as a social sign-in provider in Ory Network. Useful for B2B products integrated into the Salesforce ecosystem — sales reps and admins sign in with their existing Salesforce account, and the access token can be reused to call Salesforce APIs.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/salesforce](https://www.ory.com/docs/integrates-with/social-sign-in/salesforce) — full guide: [ory.com/docs/kratos/social-signin/salesforce](https://www.ory.com/docs/kratos/social-signin/salesforce)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/salesforce). Short version:

1. [Create a Salesforce Connected App](https://help.salesforce.com/s/articleView?id=sf.service_provider_define_oid.htm), enable OAuth Settings, and paste the Ory redirect URI as the **Callback URL**.
2. Select the `openid`, `profile`, `email` scopes. Disable **Require PKCE** (Kratos doesn't support PKCE for this provider) and enable **Require Secret for Web Server Flow**.
3. Open **Manage Consumer Details** to copy the Consumer Key (Client ID) and Consumer Secret (Client Secret) into the Ory Console form.
4. Set the **Tenant URL** in Ory to your Salesforce top-level domain (e.g. `https://myTenant.my.salesforce.com`).
5. Add the Jsonnet data-mapping snippet from the docs page (default returns email when `email_verified` is true; maps `nickname` → `username`).

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
