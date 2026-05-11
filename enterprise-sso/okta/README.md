# Okta as an OIDC provider

> **Maintained by:** Ory Engineering

Use Okta as a social sign-in / federated identity provider for your Ory project. **No webhook code required** — this integration is pure configuration in the Ory Console.

**Docs page:** [ory.com/docs/integrations/okta](https://ory.com/docs/integrations/okta)

## Setup

See [`ory-console-steps.md`](ory-console-steps.md) for the full Console flow.

The short version:

1. In Okta: create a new OIDC application (Web) with sign-in redirect:
   `https://<your-ory-project>.projects.oryapis.com/self-service/methods/oidc/callback/okta`
2. Note the Client ID and Client Secret from Okta.
3. In the Ory Console: **Authentication → Social Sign-In** → add a Generic OIDC provider with:
   - **Provider:** generic
   - **Issuer URL:** `https://<your-okta-domain>/oauth2/default`
   - **Client ID** and **Client Secret:** from step 2
   - **Scopes:** `openid email profile`
4. Save and test by signing in to your Ory-powered application.

## License

Apache-2.0. (No source code in this directory; license applies to the configuration documentation.)
