# HID Global Identity Services

> **Maintained by:** Community contributors

[HID Global](https://www.hidglobal.com) provides trusted identity solutions across both physical (badge readers, smart cards, mobile credentials) and digital (SSO, MFA, certificate-based authentication) identity. Common in government, healthcare, financial services, and manufacturing where physical-facility access and digital-application access need a unified identity.

**Type:** config (generic OIDC or generic SAML in Ory Polis — no webhook code)
**Docs page:** No dedicated HID page on ory.com/docs. Configures via:
- [Polis SAML — generic SAML 2.0 SP](https://www.ory.com/docs/polis/sso-providers/generic-saml).
- [Polis OIDC — generic OIDC provider](https://www.ory.com/docs/polis/sso-providers/generic-oidc).

## Setup outline

1. In the HID Global Authentication Service tenant, create a SAML 2.0 application (or OIDC application).
2. Paste the Ory Polis SP metadata into the HID app.
3. Define the attribute release — at minimum `email`, `firstName`, `lastName`, plus any group claims you map.
4. In Ory Network, configure the SSO connection using the generic SAML/OIDC walkthrough; paste HID's metadata XML or OIDC discovery URL.

## Notes

- HID's certificate-based authentication (smart cards / PIV / CAC) is enforced at the HID IdP layer; the Ory side simply consumes the resulting authenticated session.
- Step-up to physical badge / token authentication for high-value flows is typically configured as an HID policy that triggers re-auth before releasing the assertion to Polis.

## Status

Community / proposed — no dedicated Ory documentation. Configures via the generic SAML or OIDC path.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
