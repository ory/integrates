# CyberArk Identity

> **Maintained by:** Community contributors

[CyberArk Identity](https://www.cyberark.com/products/identity/) (the SSO and identity portion of the CyberArk platform — distinct from CyberArk's PAM product) exposes standard SAML 2.0 and OIDC endpoints for federation. Configure as an upstream IdP in Ory Network so CyberArk-managed enterprise identities can sign in to Ory-protected applications.

**Type:** config (SAML or OIDC connection on an Ory Network organization, or generic SAML/OIDC in self-hosted Ory Polis — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/cyberark-identity](https://www.ory.com/docs/integrates-with/enterprise-sso/cyberark-identity)
- [Self-hosted Ory Polis — generic SAML 2.0 SP](https://www.ory.com/docs/polis/sso-providers/generic-saml) (recommended for enterprise SSO).
- [Self-hosted Ory Polis — generic OIDC provider](https://www.ory.com/docs/polis/sso-providers/generic-oidc) if your CyberArk app is configured for OIDC.

## Ory Network connection values

On Ory Network, add CyberArk Identity as a SAML or OIDC connection to an [organization](https://www.ory.com/docs/kratos/organizations) in your project. In the CyberArk app, enter these values:

- **SAML ACS URL:** `https://<your-project-slug>.projects.oryapis.com/saml/api/oauth/saml`
- **SAML SP entity ID:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/saml/organizations/<your-organization-id>`
- **OIDC redirect URI:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/oidc/organization/<your-organization-id>/callback/<your-connection-id>`

With `pkce: force`, the OIDC redirect URI is `https://<your-project-slug>.projects.oryapis.com/self-service/methods/oidc/callback` instead. Register the URI for your connection's PKCE setting, using the project's custom domain if configured.

The Ory Console shows these values when you add the connection. When you self-host Ory Polis, use the URLs of your own Ory Polis deployment instead.

## Setup outline

1. In CyberArk Identity, create a **Custom SAML App** (or **Custom OIDC App**).
2. Enter the [Ory Network connection values](#ory-network-connection-values) in the CyberArk app. When you self-host Ory Polis, use your Ory Polis SP metadata instead.
3. In Ory Network, add a SAML or OIDC connection to an organization; paste CyberArk's metadata XML (SAML) or issuer URL + client credentials (OIDC).
4. Map the CyberArk attributes (`email`, `firstname`, `lastname`, group memberships) to Ory identity traits.
5. Enable the connection on your Ory organization.

## Notes

- PAM-specific REST integration (privileged sessions, credential rotation, etc.) is **out of scope** for this entry — open an issue if you need that pattern.
- CyberArk's group-based access policies stay on the CyberArk side; Ory only sees the resulting authentication and the attributes the IdP releases.

## Status

Community / proposed — no dedicated Ory documentation. Configures via the generic SAML or OIDC path.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
