# Tetrate Agent Router Enterprise

> **Maintained by:** Community contributors

[Tetrate Agent Router Enterprise](https://tetrate.io/) is an enterprise AI gateway built on [Envoy AI Gateway](https://aigateway.envoyproxy.io/) for routing and controlling AI-agent traffic. Pair it with Ory for dynamic, granular control over enterprise AI agents: **Ory Hydra** issues OAuth2/OIDC tokens for agents and **Ory Keto** holds the fine-grained authorization policies, while Tetrate enforces those policies on live traffic — down to parameter-level control over Model Context Protocol (MCP) tool calls.

**Type:** config (gateway + identity/authorization pattern — no first-party handler)
**Docs page:** [ory.com/docs/integrates-with/agent-identity/tetrate](https://www.ory.com/docs/integrates-with/agent-identity/tetrate)

## How it works

Two layers, each owning a distinct concern:

1. **Authorization / policy layer (Ory)** — decides what an agent or user may access at the resource level. AI agents are first-class identities authenticated through Ory; Hydra issues OAuth2/OIDC tokens (`client_credentials`), and Keto holds the fine-grained policies.
2. **Network / gateway layer (Tetrate)** — enforces those policies on live traffic when agents call models, tools, and enterprise services. When an agent invokes an MCP tool, Tetrate Agent Router Enterprise evaluates the request against the Ory-defined policies.

Because enforcement is parameter-level, Tetrate can gate **not only which tools** an agent may use **but also which request parameters** are allowed, based on policies defined in Ory Keto.

## Step-up authorization

If a request exceeds a risk threshold, the system can:

- **Pause** the request,
- **Trigger** an authentication and approval flow through Ory, and
- **Issue** short-lived elevated access.

For example: an agent processes routine refunds automatically but requires approval for larger amounts, or handles standard records access but requires additional authorization for sensitive data.

## Notable

- Tetrate Agent Router Enterprise is built on **Envoy AI Gateway** — see [`api-gateways/envoy`](../../api-gateways/envoy/) for the underlying pattern of validating Ory tokens at the edge.
- Closely related to [`agent-identity/skyfire`](../skyfire/): both treat AI agents as first-class Ory identities, differing in where verification and enforcement sit.
- Agent-identity is an emerging space — this integration reflects an announced partnership and is a reference architecture rather than a turnkey product.

## Status

Community / proposed — no dedicated Ory documentation. Based on the announced Tetrate + Ory partnership.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
