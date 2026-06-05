# IBM Security Verify

> **Maintained by:** Community contributors

[IBM Security Verify](https://www.ibm.com/products/verify-identity) is IBM's cloud-delivered identity and access management platform. It exposes standard OIDC and SAML 2.0 endpoints for federation. Configure as an upstream IdP in Ory Network so IBM-managed enterprise identities can sign in to Ory-protected applications.

**Type:** config (generic OIDC or generic SAML in Ory Polis — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/ibm-security-verify](https://www.ory.com/docs/integrates-with/enterprise-sso/ibm-security-verify)
- [Polis SAML — generic SAML 2.0 SP](https://www.ory.com/docs/polis/sso-providers/generic-saml).
- [Polis OIDC — generic OIDC provider](https://www.ory.com/docs/polis/sso-providers/generic-oidc).

## Setup outline

1. In IBM Security Verify Admin → **Applications** → **Add application** — pick **Custom SAML 2.0** or **Custom OIDC**.
2. Configure the application with Ory Polis SP details from your Ory Network organization's setup-link.
3. Map the attribute release — IBM Verify exposes a flexible attribute mapper; map email, name, and any group claims you need.
4. In Ory Network, configure the SSO connection using the generic SAML/OIDC walkthrough; paste IBM's metadata XML or OIDC discovery URL + client credentials.

## Notes

- IBM Verify supports both Verify Cloud (SaaS) and Verify Access (on-prem) — the federation flows are the same; the difference is where you administer the IdP.
- IBM-style "access policies" with risk-based authentication stay on the IBM side; Polis consumes the resulting authenticated assertion.
- For passkey / FIDO2 enforcement at the IdP layer, configure that in IBM Verify's policy engine — Ory simply consumes the assurance level reported in the assertion.

## Status

Community / proposed — no dedicated Ory documentation. Configures via the generic SAML or OIDC path.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
