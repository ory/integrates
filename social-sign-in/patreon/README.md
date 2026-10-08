# Patreon

> **Maintained by:** Ory Engineering

Add Patreon as a social sign-in provider in Ory Network. Useful for creator-economy products and member-only platforms. Ory maps the user's Patreon identity (user ID, name, email address, and profile image) to the identity schema. Ory doesn't fetch pledge or membership data.

**Type:** config (Ory CLI configuration)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/patreon](https://www.ory.com/docs/integrates-with/social-sign-in/patreon) — full guide: [ory.com/docs/kratos/social-signin/patreon](https://www.ory.com/docs/kratos/social-signin/patreon)

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/patreon). This provider is configured via the Ory CLI. Short version:

1. Create a [Patreon OAuth2 client](https://www.patreon.com/portal/registration/register-clients).
2. Set the redirect URI to `https://$PROJECT_SLUG.projects.oryapis.com/self-service/methods/oidc/callback/patreon`.
3. Create a Jsonnet snippet mapping Patreon claims (`sub`, `email`, `name`, `given_name`, `family_name`, `picture`) to your identity schema, base64-encode it.
4. Patch your Ory identity-config to add `provider: patreon` with the credentials and the base64 mapper URL.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
