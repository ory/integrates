# Microsoft

> **Maintained by:** Ory Engineering

Add Microsoft as a social sign-in provider in Ory Network. The Microsoft identity platform covers both consumer Microsoft accounts (Outlook, Xbox, Hotmail) and organizational accounts (Microsoft Entra ID / Azure AD), so the integration works for both B2C and B2B flows.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/microsoft](https://www.ory.com/docs/integrates-with/social-sign-in/microsoft) — full guide: [ory.com/docs/kratos/social-signin/microsoft](https://www.ory.com/docs/kratos/social-signin/microsoft)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/microsoft). Short version:

1. In the [Azure portal → Microsoft Entra ID](https://portal.azure.com/) → App registrations, register a new application:
   - Account type: **Multitenant + personal Microsoft accounts** (for social sign-in) or one of the org-only types for B2B.
   - Platform: **Web** with the redirect URI from the Ory Console.
2. Copy the **Application (client) ID** and **Directory (tenant) ID**, then create a new **Client credential** and copy the secret **Value** (not the ID).
3. Paste Client ID, Tenant ID, and Client Secret into the Ory Console's Microsoft form.
4. Add the `email` and `profile` scopes and the Jsonnet data-mapping snippet from the docs page.
5. Save and trigger a registration flow to test.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
