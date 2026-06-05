# OneLogin

> **Maintained by:** Ory Engineering

Configure [OneLogin](https://www.onelogin.com) (One Identity) as a SAML 2.0 Identity Provider into Ory Polis. Common workforce IdP; competes in the same space as Okta and JumpCloud.

**Type:** config (Polis SAML connection — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/onelogin](https://www.ory.com/docs/integrates-with/enterprise-sso/onelogin) — full guide: [ory.com/docs/polis/sso-providers/onelogin](https://www.ory.com/docs/polis/sso-providers/onelogin)

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/polis/sso-providers/onelogin). Short version:

1. In the **OneLogin Admin Portal** → **Applications** → **Add App**, search for **SAML Custom Connector (Advanced)** and add it.
2. Configure the SAML configuration with values from your Ory Network organization's setup-link:
   - **Audience (EntityID)**, **Recipient**, **ACS (Consumer) URL**, **ACS (Consumer) URL Validator** (regex match against ACS URL).
3. Add **Parameters** for the user attributes you map: `Email` → `Email`, `firstName` → `First Name`, `lastName` → `Last Name`. Add a Groups parameter if you map them.
4. Assign users / roles to the application.
5. From the **SSO** tab, copy the **Issuer URL** (or download the IdP metadata XML) and paste into Ory.

## Notes

- OneLogin is now branded as **One Identity OneLogin** following the Quest Software / One Identity acquisition; older docs may use either name.
- The **ACS URL Validator** is a regex — escape `?` and `&` if your ACS URL contains them.
- Group claims must be explicitly mapped via a SAML parameter; default attribute releases don't include groups.
- For SCIM provisioning of OneLogin users into Ory, see [`directory-sync/onelogin-scim`](../../directory-sync/onelogin-scim/) — separate concern from SSO.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
