# OneLogin SCIM

> **Maintained by:** Ory Engineering

Automatic user provisioning and deprovisioning from OneLogin (One Identity) into Ory Network / Ory Polis via SCIM 2.0. Pair with [`enterprise-sso/onelogin`](../../enterprise-sso/onelogin/) for the federated sign-in side.

**Type:** config (SCIM endpoint configuration — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/directory-sync/onelogin-scim](https://www.ory.com/docs/integrates-with/directory-sync/onelogin-scim)
- Ory Network (managed): [ory.com/docs/kratos/manage-identities/scim](https://www.ory.com/docs/kratos/manage-identities/scim)
- Ory Polis (self-hosted): [ory.com/docs/polis/directory-sync/providers/onelogin](https://www.ory.com/docs/polis/directory-sync/providers/onelogin)

## Setup

On Ory Network, create a SCIM client on an [organization](https://www.ory.com/docs/kratos/organizations); it has its own base URL, authorization header secret, and data mapping. See [SCIM](https://www.ory.com/docs/kratos/manage-identities/scim). For self-hosted Ory Polis, the full walkthrough lives at [ory.com/docs/polis/directory-sync/providers/onelogin](https://www.ory.com/docs/polis/directory-sync/providers/onelogin). Short version:

1. In the **OneLogin Admin Portal** → **Applications** → select the app paired with this directory sync → **Configuration** tab.
2. Set **API Connection**:
   - **SCIM Base URL** = the SCIM client's base URL on Ory Network, or the SCIM endpoint of your Ory Polis directory sync.
   - **API Bearer Token** = the SCIM client's authorization header secret on Ory Network, or your Ory Polis directory sync's bearer token.
3. Switch to the **Provisioning** tab; enable provisioning and select which events trigger automatic vs. manual approval (Create User, Delete User, Update User).
4. Configure the **Parameters** mappings — OneLogin attributes → SCIM `userName`, `name.givenName`, `name.familyName`, `emails[].value`, `groups[]`.
5. Assign users / roles to the application.

## Notes

- OneLogin's SCIM connector requires a matching SAML/OIDC application — directory sync is tied to an SSO app, not standalone.
- Provisioning events can be configured to require manual approval — useful for stricter access governance, less convenient for fast onboarding.
- Now branded as **One Identity OneLogin** following the Quest Software / One Identity acquisition.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
