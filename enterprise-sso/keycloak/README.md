# Keycloak

> **Maintained by:** Community contributors

[Keycloak](https://www.keycloak.org) is the open-source identity and access management server (originally Red Hat / now CNCF graduated). Speaks SAML 2.0, OIDC, and OAuth 2.0. Common choice for enterprises that need a self-hosted IdP — full control of the infrastructure, data residency, no vendor lock-in.

**Type:** config (generic OIDC or generic SAML in Ory Polis — no webhook code)
**Docs page:** No dedicated Keycloak page on ory.com/docs. Configures via:
- [Polis OIDC — generic OIDC provider](https://www.ory.com/docs/polis/sso-providers/generic-oidc) (recommended — Keycloak's OIDC support is first-class).
- [Polis SAML — generic SAML 2.0 SP](https://www.ory.com/docs/polis/sso-providers/generic-saml) (when SAML is required by policy).

## Setup outline (OIDC, recommended)

1. In Keycloak Admin → **Clients** → **Create client** — pick **OpenID Connect**, set Client type to **Confidential**.
2. Set the **Valid redirect URI** to the Polis ACS URL from your Ory Network organization's setup-link.
3. Note the **Client ID** and the **Client Secret** (under the client's Credentials tab).
4. The Keycloak issuer URL is `https://<keycloak-host>/realms/<realm-name>` — Polis discovers via `/.well-known/openid-configuration` automatically.
5. In Ory Network, configure the SSO connection with issuer URL + client id + secret per the generic OIDC walkthrough.

For SAML, the steps are similar but use **Clients → Create client → SAML**, then export the IdP metadata XML and paste into Ory.

## Notes

- Keycloak's "groups" are released by adding a **Group Membership** mapper to the client's dedicated client scope. Add this if you map roles or groups into Ory traits.
- Self-hosted Keycloak: pin both the Keycloak version and the Polis library version, and test upgrades against staging — Keycloak's protocol responses occasionally change in major releases.
- For Keycloak as a **downstream** SP (your app authenticates users via Keycloak that itself federates from another IdP), this entry doesn't apply — that's a Keycloak configuration concern.

## Status

Community / proposed — no dedicated Ory documentation. Configures via the generic OIDC (or SAML) path.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
