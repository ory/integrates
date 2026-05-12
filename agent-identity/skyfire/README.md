# Skyfire

> **Maintained by:** Community contributors

[Skyfire](https://skyfire.xyz) is an AI-agent identity and payment platform — "Know Your Agent" (KYA) verification for autonomous agents. Integrate with Ory Hydra (OAuth2 issuance) and Ory Kratos (identity records) so AI agents authenticate to your APIs with verifiable identity and per-agent spend controls.

**Type:** config (OAuth2 client + identity-mapping pattern — no first-party handler)
**Docs page:** No dedicated Skyfire page on ory.com/docs.

## How it works

1. Skyfire issues each AI agent a verifiable credential + a Skyfire-managed identity.
2. Your application accepts Skyfire-issued credentials, then provisions a corresponding identity in Ory Kratos (one per agent) with `metadata_public.skyfire = { agent_id, kya_status }`.
3. Ory Hydra issues OAuth2 access tokens to the agent identity using standard `client_credentials` flow; the access token's `sub` is the Kratos identity id.
4. Backend APIs validate the access token at the gateway (see [`api-gateways/*`](../../api-gateways/)) and read the agent id from `metadata_public.skyfire.agent_id` if access control needs it.
5. Payment / spend controls stay on the Skyfire side.

## Setup outline

1. Sign up at Skyfire; create an agent and obtain its credentials.
2. Build a small provisioning service that:
   - Accepts Skyfire credentials from the agent.
   - Creates / looks up a Kratos identity keyed by Skyfire's agent ID.
   - Creates an Ory Hydra OAuth2 client (or reuses one) scoped to the agent's permissions.
3. The agent uses standard OAuth2 client-credentials flow against Hydra to obtain access tokens for API calls.

## Notable

- Agent-identity is an emerging space — patterns are still firming up; this integration is a reference architecture more than a turnkey product.
- Treat each agent as a distinct Kratos identity (not as a "user with multiple agents") so audit trails and revocation work cleanly.
- KYA verification status should be re-checked periodically — Skyfire can revoke agents and your code should respect that on token issuance.

## Status

Community / proposed — no dedicated Ory documentation.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
