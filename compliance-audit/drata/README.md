# Drata

> **Maintained by:** Community contributors

[Drata](https://drata.com) is an automated security and compliance platform — continuously monitors infrastructure and workflows for SOC 2, ISO 27001, HIPAA, PCI DSS, GDPR, etc. This integration connects Drata to Ory Network to collect identity and access management evidence, removing manual evidence gathering for audits.

**Type:** config (Drata reads from Ory's admin API — no webhook code on the Ory side)
**Docs page:** No dedicated Drata page on ory.com/docs. Drata does not have a turnkey Ory connector; integration is via Drata's **Generic Custom Connector** plus an HTTP/JSON poller against the Ory admin API.

## Setup outline

1. Create an **Ory API key** (Project-scoped) with read access to identities, OAuth2 clients, and configuration.
2. In Drata → **Connections** → **Custom Connector**, configure an HTTP poller to query the Ory admin API on a schedule.
3. Common evidence to pull:
   - `GET /admin/identities` → user list, creation/deletion timestamps, MFA enrollment.
   - `GET /admin/identities/{id}` → per-user roles, credentials, recovery method.
   - `GET /admin/clients` → OAuth2 clients (treat as service accounts).
   - Ory project config → password policy, session lifespan, MFA requirements.
4. Map the returned fields to Drata's evidence types (Personnel, Access, MFA, Termination).

## Notable evidence patterns

- **Joiner / mover / leaver**: identity create / update / deactivate timestamps in Ory map to JML controls.
- **Privileged access**: OAuth2 clients with admin scopes — Drata can flag any client whose scope grants admin API access.
- **MFA enforcement**: pull each identity's credentials array and flag any without a TOTP / WebAuthn entry where policy requires it.

## Status

Community / proposed — no dedicated Ory documentation, no first-party Drata connector. Implementation lives in Drata's custom-connector layer.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
