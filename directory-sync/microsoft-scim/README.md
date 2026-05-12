# Microsoft Entra ID SCIM

> **Maintained by:** Ory Engineering

Automatic user provisioning and deprovisioning from Microsoft Entra ID (formerly Azure AD) into Ory Network / Ory Polis via SCIM 2.0. Pair with [`enterprise-sso/microsoft-entra-id`](../../enterprise-sso/microsoft-entra-id/) for the federated sign-in side.

**Type:** config (SCIM endpoint configuration — no webhook code)
**Docs page:**
- Ory Network (managed): [ory.com/docs/kratos/manage-identities/scim/ms-entra](https://www.ory.com/docs/kratos/manage-identities/scim/ms-entra)
- Ory Polis (self-hosted): [ory.com/docs/polis/directory-sync/providers/azure](https://www.ory.com/docs/polis/directory-sync/providers/azure)

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/kratos/manage-identities/scim/ms-entra). Short version:

1. In **Microsoft Entra Admin Center** → **Enterprise applications** → select the app paired with this directory sync → **Provisioning** → **Get started**.
2. Set **Provisioning Mode** = **Automatic** and paste:
   - **Tenant URL** = SCIM endpoint from your Ory directory-sync setup-link.
   - **Secret token** = SCIM bearer token from the same setup-link.
3. Test the connection — Entra ID pings the SCIM endpoint to verify it's reachable.
4. Review the **Mappings** — defaults for User and Group are usually fine; tweak attribute mappings if your identity schema needs extra fields.
5. Set **Provisioning Status** to **On** and configure the **Settings → Scope** (e.g. "Sync only assigned users and groups").

## Notes

- Entra ID syncs on a **40-minute cycle** by default — there's a "Provision on demand" button to force one user through immediately, useful for troubleshooting.
- Provisioning Mode `Manual` (the default for new apps) does nothing; you must explicitly switch to `Automatic`.
- The docs page URL is `ms-entra` for the Kratos doc; the Polis equivalent is `azure` (predates the Entra ID rename).

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
