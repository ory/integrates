# Skyfire

> **Maintained by:** Community contributors

[Skyfire](https://skyfire.xyz) is an AI-agent identity and payment platform — "Know Your Agent" (KYA) verification for autonomous agents. Integrate with Ory Hydra (OAuth2 token issuance) so AI agents authenticate to your APIs with verifiable identity and per-agent spend controls.

**Type:** config (OAuth2 client + identity-mapping pattern — no first-party handler)
**Docs page:** [ory.com/docs/integrates-with/agent-identity/skyfire](https://www.ory.com/docs/integrates-with/agent-identity/skyfire)

## How it works

1. Skyfire issues each AI agent a verifiable credential + a Skyfire-managed identity.
2. Your application accepts Skyfire-issued credentials, then registers a corresponding OAuth2 client in Ory Hydra (one per agent) and stores the Skyfire details in the client's `metadata`, for example `{ "skyfire": { "agent_id": "...", "kya_status": "..." } }`.
3. The agent gets access tokens with the `client_credentials` grant. In these tokens, `sub` is the OAuth2 client ID, not an identity ID.
4. Backend APIs validate the access token at the gateway (see [`api-gateways/*`](../../api-gateways/)) and map `sub` to the Skyfire agent, for example by reading the client's `metadata` with `GET /admin/clients/{id}`. To put the agent ID into the token instead, add it as a claim with an [OAuth2 token webhook](https://www.ory.com/docs/hydra/guides/claims-at-refresh).
5. Payment / spend controls stay on the Skyfire side.

## Setup outline

1. Sign up at Skyfire; create an agent and obtain its credentials.
2. Build a small provisioning service that:
   - Accepts Skyfire credentials from the agent.
   - Creates (or looks up) the agent's Ory Hydra OAuth2 client, scoped to the agent's permissions, with the Skyfire agent ID in the client `metadata`.
3. The agent uses the standard OAuth2 client-credentials flow against Hydra to obtain access tokens for API calls.

## Notable

- Agent-identity is an emerging space — patterns are still firming up; this integration is a reference architecture more than a turnkey product.
- Treat each agent as a distinct OAuth2 client (not as a "user with multiple agents") so audit trails and revocation work cleanly.
- KYA verification status should be re-checked periodically — Skyfire can revoke agents and your code should respect that on token issuance. The OAuth2 token webhook runs on every token request and can deny it with a `403` response.

## Status

Community / proposed — no dedicated Ory documentation.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
