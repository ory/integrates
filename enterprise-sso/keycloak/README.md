# Keycloak

> **Maintained by:** Community contributors

[Keycloak](https://www.keycloak.org) is the open-source identity and access management server (originally Red Hat / now a CNCF incubating project). Speaks SAML 2.0, OIDC, and OAuth 2.0. Common choice for enterprises that need a self-hosted IdP — full control of the infrastructure, data residency, no vendor lock-in.

**Type:** config (SAML or OIDC connection on an Ory Network organization, or generic SAML/OIDC in self-hosted Ory Polis — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/keycloak](https://www.ory.com/docs/integrates-with/enterprise-sso/keycloak)
- [Self-hosted Ory Polis — generic OIDC provider](https://www.ory.com/docs/polis/sso-providers/generic-oidc) (recommended — Keycloak's OIDC support is first-class).
- [Self-hosted Ory Polis — generic SAML 2.0 SP](https://www.ory.com/docs/polis/sso-providers/generic-saml) (when SAML is required by policy).

## Ory Network connection values

On Ory Network, add Keycloak as a SAML or OIDC connection to an [organization](https://www.ory.com/docs/kratos/organizations) in your project. In the Keycloak client, enter these values:

- **SAML ACS URL:** `https://<your-project-slug>.projects.oryapis.com/saml/api/oauth/saml`
- **SAML SP entity ID:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/saml/organizations/<your-organization-id>`
- **OIDC redirect URI:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/oidc/organization/<your-organization-id>/callback/<your-connection-id>`

With `pkce: force`, the OIDC redirect URI is `https://<your-project-slug>.projects.oryapis.com/self-service/methods/oidc/callback` instead. Register the URI for your connection's PKCE setting, using the project's custom domain if configured.

The Ory Console shows these values when you add the connection. When you self-host Ory Polis, use the URLs of your own Ory Polis deployment instead.

## Setup outline (OIDC, recommended)

1. In the Keycloak admin console, go to **Clients → Create client**. Leave **Client type** set to **OpenID Connect** and enter a client ID.
2. Turn **Client authentication** on. This makes the client confidential.
3. In **Valid redirect URIs**, enter the OIDC redirect URI for your connection's PKCE setting from [Ory Network connection values](#ory-network-connection-values).
4. Save the client, then copy the **Client Secret** from the **Credentials** tab.
5. The Keycloak issuer URL is `https://<keycloak-host>/realms/<realm-name>` — Ory discovers the endpoints via `/.well-known/openid-configuration` automatically.
6. In Ory Network, add an OIDC connection to an organization with the issuer URL, client ID, and client secret.

For SAML, the steps are similar but use **Clients → Create client → SAML**, then export the IdP metadata XML and paste into Ory.

## Notes

- Keycloak's "groups" are released by adding a **Group Membership** mapper to the client's dedicated client scope. Add this if you map roles or groups into Ory traits.
- Self-hosted Keycloak: pin the Keycloak version, and test upgrades against staging — Keycloak's protocol responses occasionally change in major releases.
- For Keycloak as a **downstream** SP (your app authenticates users via Keycloak that itself federates from another IdP), this entry doesn't apply — that's a Keycloak configuration concern.

## Status

Community / proposed — no dedicated Ory documentation. Configures via the generic OIDC (or SAML) path.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
