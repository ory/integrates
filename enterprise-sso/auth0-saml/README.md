# Auth0 SAML

> **Maintained by:** Ory Engineering

Configure [Auth0](https://auth0.com) as a SAML 2.0 Identity Provider into Ory Polis (the SAML SP). Common for organizations whose workforce identities live in Auth0 but who want Ory Network as the customer-facing identity layer with B2B SSO.

**Type:** config (Polis SAML connection — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/auth0-saml](https://www.ory.com/docs/integrates-with/enterprise-sso/auth0-saml) — full guide: [ory.com/docs/polis/sso-providers/auth0](https://www.ory.com/docs/polis/sso-providers/auth0)

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/polis/sso-providers/auth0). Short version:

1. In Auth0, create a **Regular Web Application** (or use an existing one).
2. Under the application's **Addons** tab, enable **SAML2 WEB APP**.
3. Configure the addon with the Ory Polis SP **Assertion Consumer Service (ACS) URL** and **Audience (Entity ID)** from your Ory Network organization's setup-link.
4. Download the Auth0 signing certificate and the IdP metadata.
5. Paste the metadata (or upload the XML) into the Ory organization's SSO connection screen.

## Notes

- Auth0 supports both SP-initiated and IdP-initiated SSO; Ory Polis consumes SP-initiated.
- Use **Auth0 Actions** (not the SAML addon's claims editor) for any non-trivial attribute transformation — Actions are the supported, version-controlled path.
- MFA enforcement should sit at the Auth0 IdP layer; Ory consumes the resulting authenticated assertion.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
