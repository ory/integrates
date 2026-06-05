# Okta SCIM

> **Maintained by:** Ory Engineering

Automatic user provisioning and deprovisioning from Okta into Ory Network / Ory Polis via SCIM 2.0. Pair with [`enterprise-sso/okta`](../../enterprise-sso/okta/) for the federated sign-in side.

**Type:** config (SCIM endpoint configuration — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/directory-sync/okta-scim](https://www.ory.com/docs/integrates-with/directory-sync/okta-scim)
- Ory Network (managed): [ory.com/docs/kratos/manage-identities/scim/okta](https://www.ory.com/docs/kratos/manage-identities/scim/okta)
- Ory Polis (self-hosted): [ory.com/docs/polis/directory-sync/providers/okta](https://www.ory.com/docs/polis/directory-sync/providers/okta)

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/kratos/manage-identities/scim/okta). Short version:

1. In the **Okta Admin Console** → **Applications** → select the app paired with this directory sync → **Provisioning** tab → **Integration** → **Configure API Integration**.
2. Check **Enable API integration**; paste:
   - **Base URL** = SCIM endpoint from your Ory directory-sync setup-link.
   - **API Token** = SCIM bearer token from the same setup-link.
3. Click **Test API Credentials** to verify.
4. Switch to **Provisioning → To App** and enable: **Create Users**, **Update User Attributes**, **Deactivate Users**.
5. Configure **Provisioning → To App → Attribute mappings** — defaults usually fine; tweak if your identity schema needs extra fields.
6. Assign users / groups to the application — Okta provisions only assigned identities.

## Notes

- Okta pushes lifecycle events in near-real-time (typically within seconds); much faster than Entra ID's 40-minute cycle.
- Deactivation in Okta becomes a deactivate in Ory (preserves the identity record); only **deactivate** then **delete** in Okta will hard-remove.
- For SCIM provisioning to work, the Okta app must have been created from an SCIM-capable template — older custom apps may not have the Provisioning tab.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
