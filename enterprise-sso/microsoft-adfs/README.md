# Microsoft AD FS

> **Maintained by:** Ory Engineering

Configure on-premises **Microsoft Active Directory Federation Services (AD FS)** as a SAML 2.0 Identity Provider for enterprise single sign-on (SSO). Common path for enterprises maintaining on-prem Active Directory who want SSO to cloud apps without migrating to Entra ID.

**Type:** config (SAML connection on an Ory Network organization, or self-hosted Ory Polis — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/microsoft-adfs](https://www.ory.com/docs/integrates-with/enterprise-sso/microsoft-adfs) — full guide: [ory.com/docs/polis/sso-providers/microsoft-adfs](https://www.ory.com/docs/polis/sso-providers/microsoft-adfs)

## Ory Network connection values

On Ory Network, add AD FS as a SAML connection to an [organization](https://www.ory.com/docs/kratos/organizations) in your project. In the AD FS relying party trust, enter these values:

- **ACS URL:** `https://<your-project-slug>.projects.oryapis.com/saml/api/oauth/saml`
- **SP entity ID:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/saml/organizations/<your-organization-id>`

The Ory Console shows these values when you add the connection. When you self-host Ory Polis, use the URLs of your own Ory Polis deployment instead.

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/polis/sso-providers/microsoft-adfs). Short version:

1. In **AD FS Management** → **Relying Party Trusts** → **Add Relying Party Trust**.
2. Choose **Import data about the relying party from a file** and upload the SP metadata XML, or choose **Enter data about the relying party manually** and enter the ACS URL and SP entity ID from [Ory Network connection values](#ory-network-connection-values).
3. Configure the **Claim Issuance Policy**:
   - LDAP attribute mapping: `E-Mail-Addresses → Email Address`, `Given-Name → Given Name`, `Surname → Surname`.
   - Send LDAP attributes as claims; transform to NameID format `Email`.
4. Confirm the trust is enabled.

## Notes

- AD FS supports both 2016 and 2019/2022 versions; the SAML federation flow is the same — minor UI differences in the management console.
- Token signing certificate auto-rollover requires updating the IdP metadata on the Ory SAML connection when the cert rotates (typically yearly). Subscribe to AD FS event 102 (cert rollover) or pull metadata on a schedule.
- For groups, add a **Group SID** or **Token-Groups - Unqualified Names** claim and map it server-side in Ory.
- AD FS over WS-Federation is **not supported** — Ory only consumes SAML 2.0.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
