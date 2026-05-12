# OneLogin SCIM

> **Maintained by:** Ory Engineering

Automatic user provisioning and deprovisioning from OneLogin (One Identity) into Ory Network / Ory Polis via SCIM 2.0. Pair with [`enterprise-sso/onelogin`](../../enterprise-sso/onelogin/) for the federated sign-in side.

**Type:** config (SCIM endpoint configuration — no webhook code)
**Docs page:** [ory.com/docs/polis/directory-sync/providers/onelogin](https://www.ory.com/docs/polis/directory-sync/providers/onelogin)

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/polis/directory-sync/providers/onelogin). Short version:

1. In the **OneLogin Admin Portal** → **Applications** → select the app paired with this directory sync → **Configuration** tab.
2. Set **API Connection**:
   - **SCIM Base URL** = SCIM endpoint from your Ory directory-sync setup-link.
   - **API Bearer Token** = SCIM bearer token from the same setup-link.
3. Switch to the **Provisioning** tab; enable provisioning and select which events trigger automatic vs. manual approval (Create User, Delete User, Update User).
4. Configure the **Parameters** mappings — OneLogin attributes → SCIM `userName`, `name.givenName`, `name.familyName`, `emails[].value`, `groups[]`.
5. Assign users / roles to the application.

## Notes

- OneLogin's SCIM connector requires a matching SAML/OIDC application — directory sync is tied to an SSO app, not standalone.
- Provisioning events can be configured to require manual approval — useful for stricter access governance, less convenient for fast onboarding.
- Now branded as **One Identity OneLogin** following the Quest Software / One Identity acquisition.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
