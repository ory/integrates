# Facebook

> **Maintained by:** Ory Engineering

Add Facebook as a social sign-in provider in Ory Network. Users sign in with their Facebook account; Ory fetches profile data from Facebook's Graph API (Facebook doesn't issue an OIDC id_token) and maps it to the identity schema.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/kratos/social-signin/facebook](https://www.ory.com/docs/kratos/social-signin/facebook)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/facebook). Short version:

1. Create a **Consumer** app in [Facebook Developers](https://developers.facebook.com) and add the **Facebook Login** product. Grant the `email` permission on the product configuration page.
2. Under **App settings → Basic**, copy the App ID and App Secret. Under **Facebook Login → Settings**, add the redirect URI from the Ory Console as a Valid OAuth Redirect URI.
3. Paste the App ID (Client ID) and App Secret (Client secret) into the Ory Console's Facebook form.
4. Add the `email` scope and the Jsonnet data-mapping snippet from the docs page.
5. Save and trigger a registration flow to test.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
