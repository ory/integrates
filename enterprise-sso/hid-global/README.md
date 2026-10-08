# HID Global Identity Services

> **Maintained by:** Community contributors

[HID Global](https://www.hidglobal.com) provides trusted identity solutions across both physical (badge readers, smart cards, mobile credentials) and digital (SSO, MFA, certificate-based authentication) identity. Common in government, healthcare, financial services, and manufacturing where physical-facility access and digital-application access need a unified identity.

**Type:** config (SAML or OIDC connection on an Ory Network organization, or generic SAML/OIDC in self-hosted Ory Polis — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/hid-global](https://www.ory.com/docs/integrates-with/enterprise-sso/hid-global)
- [Self-hosted Ory Polis — generic SAML 2.0 SP](https://www.ory.com/docs/polis/sso-providers/generic-saml).
- [Self-hosted Ory Polis — generic OIDC provider](https://www.ory.com/docs/polis/sso-providers/generic-oidc).

## Ory Network connection values

On Ory Network, add HID as a SAML or OIDC connection to an [organization](https://www.ory.com/docs/kratos/organizations) in your project. In the HID app, enter these values:

- **SAML ACS URL:** `https://<your-project-slug>.projects.oryapis.com/saml/api/oauth/saml`
- **SAML SP entity ID:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/saml/organizations/<your-organization-id>`
- **OIDC redirect URI:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/oidc/organization/<your-organization-id>/callback/<your-connection-id>`

With `pkce: force`, the OIDC redirect URI is `https://<your-project-slug>.projects.oryapis.com/self-service/methods/oidc/callback` instead. Register the URI for your connection's PKCE setting, using the project's custom domain if configured.

The Ory Console shows these values when you add the connection. When you self-host Ory Polis, use the URLs of your own Ory Polis deployment instead.

## Setup outline

1. In the HID Global Authentication Service tenant, create a SAML 2.0 application (or OIDC application).
2. Enter the [Ory Network connection values](#ory-network-connection-values) in the HID app. When you self-host Ory Polis, paste your Ory Polis SP metadata instead.
3. Define the attribute release — at minimum `email`, `firstName`, `lastName`, plus any group claims you map.
4. In Ory Network, add a SAML or OIDC connection to an organization; paste HID's metadata XML or OIDC discovery URL.

## Notes

- HID's certificate-based authentication (smart cards / PIV / CAC) is enforced at the HID IdP layer; the Ory side simply consumes the resulting authenticated session.
- Step-up to physical badge / token authentication for high-value flows is typically configured as an HID policy that triggers re-auth before releasing the assertion to Ory.

## Status

Community / proposed — no dedicated Ory documentation. Configures via the generic SAML or OIDC path.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
