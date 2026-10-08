# Workday SCIM

> **Maintained by:** Community contributors

Provision identities from [Workday](https://www.workday.com) (one of the most widely deployed enterprise HCM systems) into Ory Network via SCIM 2.0. Workday is the source of truth for employee data in many enterprises — wiring Workday → Ory keeps Ory's identity store in lock-step with HR ground truth without bespoke integration code.

**Type:** config (SCIM endpoint configuration — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/directory-sync/workday-scim](https://www.ory.com/docs/integrates-with/directory-sync/workday-scim)

## Setup outline

Workday's SCIM connector is not turnkey — it requires either:

1. **Workday Studio / Integration System** approach: build a Workday integration that maps Workday data sources (Worker, Position, etc.) into SCIM 2.0 calls against Ory's SCIM endpoint. This is the canonical Workday path but requires Workday Studio licensing and developer hours.

2. **Mid-tier connector** approach: deploy a connector (third-party like Tools4ever HelloID, Saviynt, or a custom service) that pulls from Workday's REST/SOAP APIs and pushes to Ory's SCIM endpoint. Lower friction than Studio if a connector for Workday→SCIM already exists.

3. **Identity-platform-fronted** approach: provision Workday → Okta/Entra ID via the IdP's native Workday connector, then provision IdP → Ory via SCIM (see [`directory-sync/okta-scim`](../okta-scim/) or [`directory-sync/microsoft-scim`](../microsoft-scim/); on Ory Network follow [Provision from Okta](https://www.ory.com/docs/kratos/manage-identities/scim/okta) or [Provision from MS Entra](https://www.ory.com/docs/kratos/manage-identities/scim/ms-entra)). This is the most common path in practice and avoids touching Workday directly.

## What Ory provides

A standard SCIM 2.0 endpoint that accepts `Users` and `Groups`. On Ory Network, each SCIM client belongs to an organization and has its own base URL, authorization header secret, and data mapping. See [SCIM](https://www.ory.com/docs/kratos/manage-identities/scim) and the [SCIM API reference](https://www.ory.com/docs/kratos/manage-identities/scim/api-reference).

## Status

Community / proposed — no dedicated Ory documentation. The pattern is the Workday integration, not the SCIM endpoint itself.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
