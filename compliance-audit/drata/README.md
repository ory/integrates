# Drata

> **Maintained by:** Community contributors

[Drata](https://drata.com) is an automated security and compliance platform — continuously monitors infrastructure and workflows for SOC 2, ISO 27001, HIPAA, PCI DSS, GDPR, etc. This integration connects Drata to Ory Network to collect identity and access management evidence, removing manual evidence gathering for audits.

**Type:** config (Drata reads from Ory's admin API — no webhook code on the Ory side)
**Docs page:** [ory.com/docs/integrates-with/compliance-audit/drata](https://www.ory.com/docs/integrates-with/compliance-audit/drata)

## Setup outline

1. Create a **project API key** for the Ory Admin API (identities and OAuth2 clients). Ory Network has no read-only API key: a project API key has full admin access to the project's data, and it can't read the project configuration. Store it as a secret in Drata.
2. To collect configuration evidence, create a **workspace API key** and read the project with `GET https://api.console.ory.com/projects/<project-id>`. A workspace API key can also change the configuration of the projects in the workspace. See [API keys](https://www.ory.com/docs/concepts/personal-access-token#workspace-api-keys-vs-project-api-keys).
3. In Drata → **Connections** → **Custom Connector**, configure an HTTP poller against these APIs on a schedule.
4. Common evidence to pull:
   - `GET /admin/identities` → user list, lifecycle timestamps, JML controls. Returns credentials only with `include_credential`.
   - `GET /admin/identities/{id}` → per-user roles, credential types, recovery method.
   - `GET /admin/clients` → OAuth2 clients (treat as service accounts).
   - `GET https://api.console.ory.com/projects/<project-id>` (workspace API key) → password policy, session lifespan, MFA requirements.
5. Map the returned fields to Drata's evidence types (Personnel, Access, MFA, Termination).

## Notable evidence patterns

- **Joiner / mover / leaver**: `created_at`, `updated_at`, `state`, and `state_changed_at` map directly to JML controls. A deactivated identity has `state: inactive`.
- **Privileged access**: inventory OAuth2 clients and the scopes they're allowed to request.
- **MFA enforcement**: credential types alone don't prove MFA enrollment: password identities can have an empty `webauthn` credential. Request `GET /admin/identities/{id}?include_credential=webauthn` and check that `credentials.webauthn.config.credentials` isn't empty; a `totp` credential exists only while TOTP is set up. Don't request `include_credential=password` or `include_credential=totp`, which return the password hash and the TOTP secret.

## Status

Community / proposed — no dedicated Ory documentation, no first-party Drata connector. Implementation lives in Drata's custom-connector layer.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
