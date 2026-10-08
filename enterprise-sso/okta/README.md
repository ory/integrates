# Okta

> **Maintained by:** Ory Engineering

Configure [Okta](https://www.okta.com) as a SAML 2.0 (preferred for B2B SSO) or OIDC Identity Provider for enterprise single sign-on (SSO). Okta is the dominant cloud workforce identity platform — a near-default option in most enterprise SSO conversations.

**Type:** config (SAML or OIDC connection on an Ory Network organization, or self-hosted Ory Polis — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/okta](https://www.ory.com/docs/integrates-with/enterprise-sso/okta) — full guide: [ory.com/docs/polis/sso-providers/okta](https://www.ory.com/docs/polis/sso-providers/okta)

## Ory Network connection values

On Ory Network, add Okta as a SAML or OIDC connection to an [organization](https://www.ory.com/docs/kratos/organizations) in your project. In the Okta app integration, enter these values:

- **SAML ACS URL:** `https://<your-project-slug>.projects.oryapis.com/saml/api/oauth/saml`
- **SAML SP entity ID:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/saml/organizations/<your-organization-id>`
- **OIDC redirect URI:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/oidc/organization/<your-organization-id>/callback/<your-connection-id>`

With `pkce: force`, the OIDC redirect URI is `https://<your-project-slug>.projects.oryapis.com/self-service/methods/oidc/callback` instead. Register the URI for your connection's PKCE setting, using the project's custom domain if configured.

The Ory Console shows these values when you add the connection. When you self-host Ory Polis, use the URLs of your own Ory Polis deployment instead.

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/polis/sso-providers/okta). Short version:

1. In the **Okta Admin Console** → **Applications** → **Create App Integration** → choose **SAML 2.0**.
2. On the SAML Settings step, configure:
   - **Single sign-on URL** = ACS URL.
   - **Audience URI (SP Entity ID)** = SP entity ID.
   - Both from [Ory Network connection values](#ory-network-connection-values).
3. Add the standard attribute statements: `email`, `firstName`, `lastName`. Add a Group attribute statement if you map groups.
4. Assign people / groups to the application.
5. From the application's **Sign On** tab, copy the **Identity Provider metadata** URL (or download the XML) and paste into Ory.

## Notes

- For OIDC instead of SAML, create an **OIDC Web Application** in Okta — same flow, but you trade the metadata XML for issuer URL + client id + secret.
- Okta's **Sign-on Policies** (MFA, network zones, device trust) sit at the IdP layer; resulting authenticated assertion flows through to Ory.
- Group claims are released **only** if explicitly mapped in the SAML application's attribute statements (or in the OIDC client's claims).

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
