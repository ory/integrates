# OneLogin

> **Maintained by:** Ory Engineering

Configure [OneLogin](https://www.onelogin.com) (One Identity) as a SAML 2.0 Identity Provider for enterprise single sign-on (SSO). Common workforce IdP; competes in the same space as Okta and JumpCloud.

**Type:** config (SAML connection on an Ory Network organization, or self-hosted Ory Polis — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/onelogin](https://www.ory.com/docs/integrates-with/enterprise-sso/onelogin) — full guide: [ory.com/docs/polis/sso-providers/onelogin](https://www.ory.com/docs/polis/sso-providers/onelogin)

## Ory Network connection values

On Ory Network, add OneLogin as a SAML connection to an [organization](https://www.ory.com/docs/kratos/organizations) in your project. In the OneLogin SAML application, enter these values:

- **ACS URL:** `https://<your-project-slug>.projects.oryapis.com/saml/api/oauth/saml`
- **SP entity ID:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/saml/organizations/<your-organization-id>`

The Ory Console shows these values when you add the connection. When you self-host Ory Polis, use the URLs of your own Ory Polis deployment instead.

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/polis/sso-providers/onelogin). Short version:

1. In the **OneLogin Admin Portal** → **Applications** → **Add App**, search for **SAML Custom Connector (Advanced)** and add it.
2. Configure the SAML configuration with values from [Ory Network connection values](#ory-network-connection-values):
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
