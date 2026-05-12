# CyberArk Identity

> **Maintained by:** Community contributors

[CyberArk Identity](https://www.cyberark.com/products/identity/) (the SSO and identity portion of the CyberArk platform — distinct from CyberArk's PAM product) exposes standard SAML 2.0 and OIDC endpoints for federation. Configure as an upstream IdP in Ory Network so CyberArk-managed enterprise identities can sign in to Ory-protected applications.

**Type:** config (generic OIDC or generic SAML in Ory Polis — no webhook code)
**Docs page:** No dedicated CyberArk page on ory.com/docs. Configures via:
- [Polis SAML — generic SAML 2.0 SP](https://www.ory.com/docs/polis/sso-providers/generic-saml) (recommended for enterprise SSO).
- [Polis OIDC — generic OIDC provider](https://www.ory.com/docs/polis/sso-providers/generic-oidc) if your CyberArk app is configured for OIDC.

## Setup outline

1. In CyberArk Identity, create a **Custom SAML App** (or **Custom OIDC App**).
2. Configure the Ory Polis SP metadata (entity ID, ACS URL, certificate) into the CyberArk app.
3. In Ory Network, configure the SSO connection using the generic SAML/OIDC provider walkthrough above; paste CyberArk's metadata XML (SAML) or issuer URL + client credentials (OIDC).
4. Map the CyberArk attributes (`email`, `firstname`, `lastname`, group memberships) to Ory identity traits.
5. Enable the connection on your Ory organization.

## Notes

- PAM-specific REST integration (privileged sessions, credential rotation, etc.) is **out of scope** for this entry — open an issue if you need that pattern.
- CyberArk's group-based access policies stay on the CyberArk side; Ory only sees the resulting authentication and the attributes the IdP releases.

## Status

Community / proposed — no dedicated Ory documentation. Configures via the generic SAML or OIDC path.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
