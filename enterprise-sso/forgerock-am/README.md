# ForgeRock Access Management

> **Maintained by:** Community contributors

[ForgeRock Access Management](https://www.pingidentity.com/en/platform/forgerock.html) (now part of Ping Identity) is a widely deployed enterprise IAM platform supporting OIDC, OAuth 2.0, and SAML 2.0. Configure as an upstream IdP in Ory Network so existing ForgeRock-managed sessions flow through to Ory-protected applications.

**Type:** config (SAML or OIDC connection on an Ory Network organization, or generic SAML/OIDC in self-hosted Ory Polis — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/forgerock-am](https://www.ory.com/docs/integrates-with/enterprise-sso/forgerock-am)
- [Self-hosted Ory Polis — generic SAML 2.0 SP](https://www.ory.com/docs/polis/sso-providers/generic-saml).
- [Self-hosted Ory Polis — generic OIDC provider](https://www.ory.com/docs/polis/sso-providers/generic-oidc).

## Ory Network connection values

On Ory Network, add ForgeRock AM as a SAML or OIDC connection to an [organization](https://www.ory.com/docs/kratos/organizations) in your project. In the ForgeRock app, enter these values:

- **SAML ACS URL:** `https://<your-project-slug>.projects.oryapis.com/saml/api/oauth/saml`
- **SAML SP entity ID:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/saml/organizations/<your-organization-id>`
- **OIDC redirect URI:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/oidc/organization/<your-organization-id>/callback/<your-connection-id>`

With `pkce: force`, the OIDC redirect URI is `https://<your-project-slug>.projects.oryapis.com/self-service/methods/oidc/callback` instead. Register the URI for your connection's PKCE setting, using the project's custom domain if configured.

The Ory Console shows these values when you add the connection. When you self-host Ory Polis, use the URLs of your own Ory Polis deployment instead.

## Setup outline

1. In ForgeRock AM, create a SAML 2.0 entity (or OIDC client) — typically under **Realms → Applications → Federation** for SAML, or **OAuth 2.0 → Clients** for OIDC.
2. Enter the [Ory Network connection values](#ory-network-connection-values) in the ForgeRock app. When you self-host Ory Polis, use your Ory Polis SP metadata instead.
3. In Ory Network, add a SAML or OIDC connection to an organization; paste ForgeRock's metadata XML (SAML) or OIDC discovery URL + client credentials.
4. Map ForgeRock's released attributes to Ory identity traits.

## Notes

- ForgeRock SAML supports both IdP-initiated and SP-initiated flows. SAML connections on Ory Network support IdP-initiated login, which is off by default; see [IdP-initiated login](https://www.ory.com/docs/kratos/organizations#idp-initiated-login).
- ForgeRock OIDC supports the standard `openid`, `profile`, `email`, `groups` scopes; group claims may need a custom OIDC scope mapper depending on your AM version.
- ForgeRock AM is now branded as **Ping Identity Platform** following the 2023 acquisition; older docs may use either name.

## Status

Community / proposed — no dedicated Ory documentation. Configures via the generic SAML or OIDC path.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
