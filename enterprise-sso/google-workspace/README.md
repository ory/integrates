# Google Workspace SAML

> **Maintained by:** Ory Engineering

Configure [Google Workspace](https://workspace.google.com) (formerly G Suite) as a SAML Identity Provider for enterprise single sign-on (SSO). One of the most common enterprise SSO integrations — most workforce identities already live in Workspace, and the Admin Console makes the SAML app setup straightforward.

**Type:** config (SAML connection on an Ory Network organization, or self-hosted Ory Polis — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/google-workspace](https://www.ory.com/docs/integrates-with/enterprise-sso/google-workspace) — full guide: [ory.com/docs/polis/sso-providers/google](https://www.ory.com/docs/polis/sso-providers/google)

## Ory Network connection values

On Ory Network, add Google Workspace as a SAML connection to an [organization](https://www.ory.com/docs/kratos/organizations) in your project. In the Google Workspace custom SAML app, enter these values:

- **ACS URL:** `https://<your-project-slug>.projects.oryapis.com/saml/api/oauth/saml`
- **SP entity ID:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/saml/organizations/<your-organization-id>`

The Ory Console shows these values when you add the connection. When you self-host Ory Polis, use the URLs of your own Ory Polis deployment instead.

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/polis/sso-providers/google). Short version:

1. In the Google Workspace **Admin Console** → **Apps → Web and mobile apps**, click **Add app → Add custom SAML app**.
2. Download the IdP metadata XML (or copy the SSO URL, Entity ID, and certificate).
3. Configure the **Service Provider details** with the ACS URL and SP entity ID from [Ory Network connection values](#ory-network-connection-values).
4. Set up the **attribute mapping** — at minimum: `Primary email` → `email`, `First name` → `firstName`, `Last name` → `lastName`. Add groups via the Group Membership attribute if you map them.
5. Enable the app for the relevant Google Workspace organizational units.

## Notes

- Workspace requires the SAML app to be **enabled per OU** before users can sign in — easy to forget.
- Group membership claims are released only when explicitly mapped in the SAML app's attribute mapping.
- For OIDC instead of SAML, configure Workspace as a Google OIDC provider via [`social-sign-in/google`](../../social-sign-in/google/) — but for true enterprise SSO with B2B per-organization isolation, a SAML connection on an organization is the right path.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
