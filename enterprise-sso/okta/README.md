# Okta

> **Maintained by:** Ory Engineering

Configure [Okta](https://www.okta.com) as a SAML 2.0 (preferred for B2B SSO) or OIDC Identity Provider into Ory Polis. Okta is the dominant cloud workforce identity platform — a near-default option in most enterprise SSO conversations.

**Type:** config (Polis SAML or OIDC connection — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/okta](https://www.ory.com/docs/integrates-with/enterprise-sso/okta) — full guide: [ory.com/docs/polis/sso-providers/okta](https://www.ory.com/docs/polis/sso-providers/okta)

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/polis/sso-providers/okta). Short version:

1. In the **Okta Admin Console** → **Applications** → **Create App Integration** → choose **SAML 2.0**.
2. On the SAML Settings step, configure:
   - **Single sign-on URL** = Polis ACS URL.
   - **Audience URI (SP Entity ID)** = Polis Entity ID.
   - Both from your Ory Network organization's setup-link.
3. Add the standard attribute statements: `email`, `firstName`, `lastName`. Add a Group attribute statement if you map groups.
4. Assign people / groups to the application.
5. From the application's **Sign On** tab, copy the **Identity Provider metadata** URL (or download the XML) and paste into Ory.

## Notes

- For OIDC instead of SAML, create an **OIDC Web Application** in Okta — same flow, but you trade the metadata XML for issuer URL + client id + secret.
- Okta's **Sign-on Policies** (MFA, network zones, device trust) sit at the IdP layer; resulting authenticated assertion flows through to Ory.
- Group claims are released **only** if explicitly mapped in the SAML application's attribute statements (or in the OIDC client's claims).

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
