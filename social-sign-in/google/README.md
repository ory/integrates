# Google

> **Maintained by:** Ory Engineering

Add Google as a social sign-in provider in Ory Network. Google is the most widely-recognized OIDC provider; users sign in with their existing Google account (consumer Gmail or Google Workspace) and Ory maps the returned claims to the identity schema.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/google](https://www.ory.com/docs/integrates-with/social-sign-in/google) — full guide: [ory.com/docs/kratos/social-signin/google](https://www.ory.com/docs/kratos/social-signin/google)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/google). Short version:

1. Create an OAuth 2.0 Client in [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) (application type: Web application). Configure an OAuth consent screen first if you haven't.
2. Add the redirect URI from the Ory Console (`Authentication → Social sign-in → Google`) to the Google OAuth client's **Authorized redirect URIs**.
3. Paste the Client ID and Client secret back into the Ory Console form.
4. Add scopes `openid`, `email`, `profile`, and the Jsonnet data-mapping snippet from the docs page.
5. Save and trigger a registration flow to test.

Google supports automatic account linking for consumer accounts and the FedCM browser-native flow — both are covered on the docs page.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
