# JumpCloud

> **Maintained by:** Ory Engineering

Configure [JumpCloud](https://jumpcloud.com) — the cloud directory platform — as a SAML 2.0 Identity Provider for enterprise single sign-on (SSO). JumpCloud is the modern alternative to on-prem Active Directory and a common workforce IdP for organizations without legacy AD.

**Type:** config (SAML connection on an Ory Network organization, or self-hosted Ory Polis — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/jumpcloud](https://www.ory.com/docs/integrates-with/enterprise-sso/jumpcloud) — full guide: [ory.com/docs/polis/sso-providers/jumpcloud](https://www.ory.com/docs/polis/sso-providers/jumpcloud)

## Ory Network connection values

On Ory Network, add JumpCloud as a SAML connection to an [organization](https://www.ory.com/docs/kratos/organizations) in your project. In the JumpCloud SSO application, enter these values:

- **ACS URL:** `https://<your-project-slug>.projects.oryapis.com/saml/api/oauth/saml`
- **SP entity ID:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/saml/organizations/<your-organization-id>`

The Ory Console shows these values when you add the connection. When you self-host Ory Polis, use the URLs of your own Ory Polis deployment instead.

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/polis/sso-providers/jumpcloud). Short version:

1. In the **JumpCloud Admin console** → **SSO**, click the plus icon → **Custom SAML App**.
2. Configure the SP-side fields (ACS URL, SP entity ID) using the values from [Ory Network connection values](#ory-network-connection-values).
3. Set up the **attribute mapping** — at minimum: `email`, `firstname`, `lastname`. Add group claims via the `memberOf` attribute if you map them.
4. Assign user groups to the SAML application.
5. Activate the application.

## Notes

- JumpCloud requires explicit **user-group assignment** to the SAML app — users not in an assigned group cannot sign in even if they exist in the directory.
- For SCIM provisioning of JumpCloud users into Ory, see [`directory-sync/jumpcloud-scim`](../../directory-sync/jumpcloud-scim/) — separate concern from SSO.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
