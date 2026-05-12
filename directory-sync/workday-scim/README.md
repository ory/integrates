# Workday SCIM

> **Maintained by:** Community contributors

Provision identities from [Workday](https://www.workday.com) (one of the most widely deployed enterprise HCM systems) into Ory Network via SCIM 2.0. Workday is the source of truth for employee data in many enterprises — wiring Workday → Ory keeps Ory's identity store in lock-step with HR ground truth without bespoke integration code.

**Type:** config (SCIM endpoint configuration — no webhook code)
**Docs page:** No dedicated Workday page on ory.com/docs. The Ory side is a standard SCIM 2.0 endpoint — Workday connects to it like any other SCIM consumer.

## Setup outline

Workday's SCIM connector is not turnkey — it requires either:

1. **Workday Studio / Integration System** approach: build a Workday integration that maps Workday data sources (Worker, Position, etc.) into SCIM 2.0 calls against Ory's directory-sync endpoint. This is the canonical Workday path but requires Workday Studio licensing and developer hours.

2. **Mid-tier connector** approach: deploy a connector (third-party like Tools4ever HelloID, Saviynt, or a custom service) that pulls from Workday's REST/SOAP APIs and pushes to Ory's SCIM endpoint. Lower friction than Studio if a connector for Workday→SCIM already exists.

3. **Identity-platform-fronted** approach: provision Workday → Okta/Entra ID via the IdP's native Workday connector, then provision IdP → Ory via SCIM (see [`directory-sync/okta-scim`](../okta-scim/) or [`directory-sync/microsoft-scim`](../microsoft-scim/)). This is the most common path in practice and avoids touching Workday directly.

## What Ory provides

A standard SCIM 2.0 endpoint with bearer-token auth, accepting `Users` and `Groups`. Endpoint URL and bearer token are provided in your Ory directory-sync setup-link.

## Status

Community / proposed — no dedicated Ory documentation. The pattern is the Workday integration, not the SCIM endpoint itself.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
