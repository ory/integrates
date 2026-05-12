# ForgeRock Access Management

> **Maintained by:** Community contributors

[ForgeRock Access Management](https://www.pingidentity.com/en/platform/forgerock.html) (now part of Ping Identity) is a widely deployed enterprise IAM platform supporting OIDC, OAuth 2.0, and SAML 2.0. Configure as an upstream IdP in Ory Network so existing ForgeRock-managed sessions flow through to Ory-protected applications.

**Type:** config (generic OIDC or generic SAML in Ory Polis — no webhook code)
**Docs page:** No dedicated ForgeRock page on ory.com/docs. Configures via:
- [Polis SAML — generic SAML 2.0 SP](https://www.ory.com/docs/polis/sso-providers/generic-saml).
- [Polis OIDC — generic OIDC provider](https://www.ory.com/docs/polis/sso-providers/generic-oidc).

## Setup outline

1. In ForgeRock AM, create a SAML 2.0 entity (or OIDC client) — typically under **Realms → Applications → Federation** for SAML, or **OAuth 2.0 → Clients** for OIDC.
2. Configure the Ory Polis SP metadata (entity ID, ACS URL, certificate) into the ForgeRock app.
3. In Ory Network, configure the SSO connection using the generic SAML/OIDC walkthrough; paste ForgeRock's metadata XML (SAML) or OIDC discovery URL + client credentials.
4. Map ForgeRock's released attributes to Ory identity traits.

## Notes

- ForgeRock SAML supports both IdP-initiated and SP-initiated flows. Polis only consumes SP-initiated assertions; configure the ForgeRock side accordingly.
- ForgeRock OIDC supports the standard `openid`, `profile`, `email`, `groups` scopes; group claims may need a custom OIDC scope mapper depending on your AM version.
- ForgeRock AM is now branded as **Ping Identity Platform** following the 2023 acquisition; older docs may use either name.

## Status

Community / proposed — no dedicated Ory documentation. Configures via the generic SAML or OIDC path.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
