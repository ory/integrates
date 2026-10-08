# Vanta

> **Maintained by:** Community contributors

[Vanta](https://www.vanta.com) is an automated security and compliance platform — continuously monitors security posture for SOC 2, ISO 27001, HIPAA, and similar frameworks. This integration connects Vanta to Ory Network's admin API to collect identity and access management evidence automatically.

**Type:** config (Vanta reads from Ory's admin API — no webhook code on the Ory side)
**Docs page:** [ory.com/docs/integrates-with/compliance-audit/vanta](https://www.ory.com/docs/integrates-with/compliance-audit/vanta)

## Setup outline

1. Create a **project API key** for the Ory Admin API (identities and OAuth2 clients). Ory Network has no read-only API key: a project API key has full admin access to the project's data, and it can't read the project configuration. Store it as a secret in Vanta.
2. To collect configuration evidence, create a **workspace API key** and read the project with `GET https://api.console.ory.com/projects/<project-id>`. A workspace API key can also change the configuration of the projects in the workspace. See [API keys](https://www.ory.com/docs/concepts/personal-access-token#workspace-api-keys-vs-project-api-keys).
3. In Vanta → **Integrations** → **Add Custom Integration** (or via the Vanta API), configure an API poller against these APIs on a schedule.
4. Common evidence to pull:
   - `GET /admin/identities` → user list, lifecycle timestamps. Returns credentials only with `include_credential`.
   - `GET /admin/identities/{id}` → per-user roles, credential types, recovery method.
   - `GET /admin/clients` → OAuth2 clients (treat as service accounts).
   - `GET https://api.console.ory.com/projects/<project-id>` (workspace API key) → password policy, session lifespan, MFA requirements.
5. Map the returned fields to Vanta's compliance Tests (Personnel, Access Reviews, MFA, Termination, Password Policy).

## Notable evidence patterns

- **Access reviews**: pull the full identity list; for last activity, list each identity's sessions (`GET /admin/identities/{id}/sessions`). Vanta can flag dormant accounts.
- **Termination controls**: `state: inactive` and `state_changed_at` close the loop on offboarding evidence.
- **MFA enforcement**: credential types alone don't prove MFA enrollment: password identities can have an empty `webauthn` credential. Request `GET /admin/identities/{id}?include_credential=webauthn` and check that `credentials.webauthn.config.credentials` isn't empty; a `totp` credential exists only while TOTP is set up. Don't request `include_credential=password` or `include_credential=totp`, which return the password hash and the TOTP secret.
- **Password policy**: pull the project configuration with the workspace API key; Vanta validates it against the configured minimum complexity rules.

## Status

Community / proposed — no dedicated Ory documentation, no first-party Vanta connector. Implementation lives in Vanta's custom-integration layer.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
