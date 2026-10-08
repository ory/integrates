# JumpCloud SCIM

> **Maintained by:** Ory Engineering

Automatic user provisioning and deprovisioning from JumpCloud into Ory Network / Ory Polis via SCIM 2.0. Pair with [`enterprise-sso/jumpcloud`](../../enterprise-sso/jumpcloud/) for the federated sign-in side.

**Type:** config (SCIM endpoint configuration — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/directory-sync/jumpcloud-scim](https://www.ory.com/docs/integrates-with/directory-sync/jumpcloud-scim)
- Ory Network (managed): [ory.com/docs/kratos/manage-identities/scim](https://www.ory.com/docs/kratos/manage-identities/scim)
- Ory Polis (self-hosted): [ory.com/docs/polis/directory-sync/providers/jumpcloud](https://www.ory.com/docs/polis/directory-sync/providers/jumpcloud)

## Setup

On Ory Network, create a SCIM client on an [organization](https://www.ory.com/docs/kratos/organizations); it has its own base URL, authorization header secret, and data mapping. See [SCIM](https://www.ory.com/docs/kratos/manage-identities/scim). For self-hosted Ory Polis, the full walkthrough lives at [ory.com/docs/polis/directory-sync/providers/jumpcloud](https://www.ory.com/docs/polis/directory-sync/providers/jumpcloud). Short version:

1. In the **JumpCloud Admin Console** → **SSO Applications** → select the app paired with this directory sync → **Identity Management** tab.
2. Enable **Identity Management** and paste:
   - **SCIM Base URL** = the SCIM client's base URL on Ory Network, or the SCIM endpoint of your Ory Polis directory sync.
   - **API key** = the SCIM client's authorization header secret on Ory Network, or your Ory Polis directory sync's bearer token.
3. Configure the **attribute mapping** — email → `userName`, given/family name → `name.givenName`/`name.familyName`, group membership → `groups`.
4. Assign user groups to the application — JumpCloud pushes only assigned-group members.

## Notes

- JumpCloud's SCIM provisioning is tied to a SAML application — you can't run SCIM without also having the corresponding SAML app configured.
- JumpCloud pushes lifecycle events on its own schedule; there's no manual sync button in the UI.
- For SSO without SCIM (or vice versa), each can run independently — but in practice you almost always want both.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
