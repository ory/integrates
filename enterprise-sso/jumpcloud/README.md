# JumpCloud

> **Maintained by:** Ory Engineering

Configure [JumpCloud](https://jumpcloud.com) — the cloud directory platform — as a SAML 2.0 Identity Provider into Ory Polis. JumpCloud is the modern alternative to on-prem Active Directory and a common workforce IdP for organizations without legacy AD.

**Type:** config (Polis SAML connection — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/jumpcloud](https://www.ory.com/docs/integrates-with/enterprise-sso/jumpcloud) — full guide: [ory.com/docs/polis/sso-providers/jumpcloud](https://www.ory.com/docs/polis/sso-providers/jumpcloud)

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/polis/sso-providers/jumpcloud). Short version:

1. In the **JumpCloud Admin console** → **SSO**, click the plus icon → **Custom SAML App**.
2. Configure the SP-side fields (IdP Entity ID, ACS URL, Audience URI) using the values from your Ory Network organization's setup-link.
3. Set up the **attribute mapping** — at minimum: `email`, `firstname`, `lastname`. Add group claims via the `memberOf` attribute if you map them.
4. Assign user groups to the SAML application.
5. Activate the application.

## Notes

- JumpCloud requires explicit **user-group assignment** to the SAML app — users not in an assigned group cannot sign in even if they exist in the directory.
- For SCIM provisioning of JumpCloud users into Ory, see [`directory-sync/jumpcloud-scim`](../../directory-sync/jumpcloud-scim/) — separate concern from SSO.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
