# Google Workspace SCIM

> **Maintained by:** Ory Engineering

Automatic user provisioning and deprovisioning from Google Workspace into Ory Network via SCIM 2.0. Users created or deactivated in Workspace's directory propagate to Ory automatically — no manual user management.

**Type:** config (SCIM endpoint configuration — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/directory-sync/google-workspace-scim](https://www.ory.com/docs/integrates-with/directory-sync/google-workspace-scim)
- Ory Network (managed): [ory.com/docs/kratos/manage-identities/scim/google-workspace](https://www.ory.com/docs/kratos/manage-identities/scim/google-workspace)
- Ory Polis (self-hosted): [ory.com/docs/polis/directory-sync/providers/google](https://www.ory.com/docs/polis/directory-sync/providers/google)

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/kratos/manage-identities/scim/google-workspace). Short version:

Google Workspace provisions users only to the apps in its [list of supported apps](https://knowledge.workspace.google.com/admin/users/advanced/about-automated-user-provisioning), not to a custom SCIM endpoint such as Ory Network. The Ory Network guide works around this with a supported catalog app.

1. In **Google Workspace Admin Console** → **Apps → Web and mobile apps** → **Add app → Search for apps**, search for **Keeper** and select **Keeper Web (SAML)**.
2. Under the app's provisioning section, click **Configure autoprovisioning** and enter:
   - **Access token** = the authorization header secret of the SCIM client on your Ory Network organization.
   - **Endpoint URL** = the SCIM client's base URL.
3. Configure the **attribute mapping** — Google primary email → `userName`, given/family name → `name.givenName`/`name.familyName`, groups → `groups`.
4. Choose the provisioning scope — which OUs / groups Workspace will sync to Ory.
5. Toggle **on for all** users / OUs covered.

## Notes

- SCIM provisioning is a separate concern from SSO — pair with [`enterprise-sso/google-workspace`](../../enterprise-sso/google-workspace/) for the federated sign-in side.
- Workspace pushes user lifecycle events (create / update / disable / delete) on its own schedule — typically within a few minutes of the directory change. There's no manual "push now" button.
- Deactivation in Workspace becomes a deactivate in Ory (preserving the identity record) — not a hard delete.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
