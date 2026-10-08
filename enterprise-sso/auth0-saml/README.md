# Auth0 SAML

> **Maintained by:** Ory Engineering

Configure [Auth0](https://auth0.com) as a SAML 2.0 Identity Provider for enterprise single sign-on (SSO). Common for organizations whose workforce identities live in Auth0 but who want Ory Network as the customer-facing identity layer with B2B SSO.

**Type:** config (SAML connection on an Ory Network organization, or self-hosted Ory Polis — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/auth0-saml](https://www.ory.com/docs/integrates-with/enterprise-sso/auth0-saml) — full guide: [ory.com/docs/polis/sso-providers/auth0](https://www.ory.com/docs/polis/sso-providers/auth0)

## Ory Network connection values

On Ory Network, add Auth0 as a SAML connection to an [organization](https://www.ory.com/docs/kratos/organizations) in your project. In the Auth0 SAML application, enter these values:

- **ACS URL:** `https://<your-project-slug>.projects.oryapis.com/saml/api/oauth/saml`
- **SP entity ID:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/saml/organizations/<your-organization-id>`

The Ory Console shows these values when you add the connection. When you self-host Ory Polis, use the URLs of your own Ory Polis deployment instead.

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/polis/sso-providers/auth0). Short version:

1. In Auth0, create a **Regular Web Application** (or use an existing one).
2. Under the application's **Addons** tab, enable **SAML2 WEB APP**.
3. Configure the addon with the **Assertion Consumer Service (ACS) URL** and **Audience (Entity ID)** from [Ory Network connection values](#ory-network-connection-values).
4. Download the Auth0 signing certificate and the IdP metadata.
5. Paste the metadata (or upload the XML) into the Ory organization's SSO connection screen.

## Notes

- Auth0 supports both SP-initiated and IdP-initiated SSO. SAML connections on Ory Network support IdP-initiated login, which is off by default; see [IdP-initiated login](https://www.ory.com/docs/kratos/organizations#idp-initiated-login).
- Use **Auth0 Actions** (not the SAML addon's claims editor) for any non-trivial attribute transformation — Actions are the supported, version-controlled path.
- MFA enforcement should sit at the Auth0 IdP layer; Ory consumes the resulting authenticated assertion.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
