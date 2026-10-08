# IBM Verify

> **Maintained by:** Community contributors

[IBM Verify](https://www.ibm.com/products/verify-identity) (formerly IBM Security Verify) is IBM's cloud-delivered identity and access management platform. It exposes standard OIDC and SAML 2.0 endpoints for federation. Configure as an upstream IdP in Ory Network so IBM-managed enterprise identities can sign in to Ory-protected applications.

**Type:** config (SAML or OIDC connection on an Ory Network organization, or generic SAML/OIDC in self-hosted Ory Polis — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/ibm-security-verify](https://www.ory.com/docs/integrates-with/enterprise-sso/ibm-security-verify)
- [Self-hosted Ory Polis — generic SAML 2.0 SP](https://www.ory.com/docs/polis/sso-providers/generic-saml).
- [Self-hosted Ory Polis — generic OIDC provider](https://www.ory.com/docs/polis/sso-providers/generic-oidc).

## Ory Network connection values

On Ory Network, add IBM Verify as a SAML or OIDC connection to an [organization](https://www.ory.com/docs/kratos/organizations) in your project. In the IBM Verify application, enter these values:

- **SAML ACS URL:** `https://<your-project-slug>.projects.oryapis.com/saml/api/oauth/saml`
- **SAML SP entity ID:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/saml/organizations/<your-organization-id>`
- **OIDC redirect URI:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/oidc/organization/<your-organization-id>/callback/<your-connection-id>`

With `pkce: force`, the OIDC redirect URI is `https://<your-project-slug>.projects.oryapis.com/self-service/methods/oidc/callback` instead. Register the URI for your connection's PKCE setting, using the project's custom domain if configured.

The Ory Console shows these values when you add the connection. When you self-host Ory Polis, use the URLs of your own Ory Polis deployment instead.

## Setup outline

1. In IBM Verify, go to **Applications** and add a custom application. On the **Sign-on** tab, set the sign-on method to **SAML2.0** or **OpenID Connect 1.0**.
2. Enter the [Ory Network connection values](#ory-network-connection-values) in the application. When you self-host Ory Polis, use your Ory Polis SP details instead.
3. Map the attribute release — IBM Verify exposes a flexible attribute mapper; map email, name, and any group claims you need.
4. In Ory Network, add a SAML or OIDC connection to an organization; paste IBM's metadata XML or OIDC discovery URL + client credentials.

## Notes

- IBM Verify (SaaS) and IBM Verify Identity Access (on-premises, formerly IBM Security Verify Access) both support SAML 2.0 and OIDC federation; the difference is where you administer the IdP.
- IBM-style "access policies" with risk-based authentication stay on the IBM side; Ory consumes the resulting authenticated assertion.
- For passkey / FIDO2 enforcement at the IdP layer, configure that in IBM Verify's policy engine — Ory simply consumes the assurance level reported in the assertion.

## Status

Community / proposed — no dedicated Ory documentation. Configures via the generic SAML or OIDC path.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
