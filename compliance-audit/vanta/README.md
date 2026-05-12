# Vanta

> **Maintained by:** Community contributors

[Vanta](https://www.vanta.com) is an automated security and compliance platform — continuously monitors security posture for SOC 2, ISO 27001, HIPAA, and similar frameworks. This integration connects Vanta to Ory Network's admin API to collect identity and access management evidence automatically.

**Type:** config (Vanta reads from Ory's admin API — no webhook code on the Ory side)
**Docs page:** No dedicated Vanta page on ory.com/docs. Vanta does not have a turnkey Ory connector; integration is via Vanta's **Custom Integration / API integration** plus an HTTP poller against the Ory admin API.

## Setup outline

1. Create an **Ory API key** (Project-scoped) with read access to identities, OAuth2 clients, and configuration.
2. In Vanta → **Integrations** → **Add Custom Integration** (or via the Vanta API), configure an API poller against the Ory admin API on a schedule.
3. Common evidence to pull:
   - `GET /admin/identities` → user list, creation/deletion timestamps, MFA enrollment.
   - `GET /admin/identities/{id}` → per-user roles, credentials, recovery method.
   - `GET /admin/clients` → OAuth2 clients (treat as service accounts).
   - Ory project config → password policy, session lifespan, MFA requirements.
4. Map the returned fields to Vanta's compliance Tests (Personnel, Access Reviews, MFA, Termination, Password Policy).

## Notable evidence patterns

- **Access reviews**: pull the full identity list + their last-active timestamp; Vanta can flag dormant accounts.
- **Termination controls**: deactivation timestamps in Ory close the loop on offboarding evidence.
- **MFA enforcement**: pull each identity's credentials array; Vanta flags identities without TOTP / WebAuthn where policy requires it.
- **Password policy**: pull project config; Vanta validates against the configured minimum complexity rules.

## Status

Community / proposed — no dedicated Ory documentation, no first-party Vanta connector. Implementation lives in Vanta's custom-integration layer.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
