# Microsoft Entra ID (Azure AD)

> **Maintained by:** Ory Engineering

Configure [Microsoft Entra ID](https://www.microsoft.com/en-us/security/business/identity-access/microsoft-entra-id) (formerly Azure Active Directory) as a SAML 2.0 Identity Provider into Ory Polis. Entra ID is the default IdP for organizations on Microsoft 365 / Azure — the most common enterprise SSO integration alongside Google Workspace.

**Type:** config (Polis SAML connection — no webhook code)
**Docs page:** [ory.com/docs/polis/sso-providers/azure](https://www.ory.com/docs/polis/sso-providers/azure) (filename is the historical `azure` — Microsoft renamed Azure AD to Entra ID in 2023; the docs page covers the same product).

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/polis/sso-providers/azure). Short version:

1. In **Microsoft Entra Admin Center** → **Enterprise applications** → **New application** → **Create your own application**, choose **Integrate any other application you don't find in the gallery (Non-gallery)**.
2. Under the new app → **Single sign-on** → **SAML**, configure:
   - **Identifier (Entity ID)** and **Reply URL (ACS)** from your Ory Network organization's setup-link.
3. Download the **Federation Metadata XML** and paste into Ory's organization SSO connection.
4. Configure user/group **assignments** to the application — by default Entra ID requires explicit assignment (this can be disabled per app, but explicit is safer).
5. Adjust the **claims** if you need anything beyond `email`/`given_name`/`surname`/`name` — Entra ID's defaults are usually fine.

## Notes

- **Assignment required** is on by default — easy to forget. Users must be in an assigned group (or directly assigned) to sign in even if they exist in the tenant.
- Entra ID's **Conditional Access** policies (MFA, device compliance, named locations) sit at the IdP layer; the resulting authenticated assertion flows through to Ory unchanged.
- For OIDC sign-in (typically consumer or low-friction), use [`social-sign-in/microsoft`](../../social-sign-in/microsoft/) — Polis SAML is for B2B enterprise SSO with per-organization isolation.
- For SCIM provisioning of Entra ID users into Ory, see [`directory-sync/microsoft-scim`](../../directory-sync/microsoft-scim/) — separate concern from SSO.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
