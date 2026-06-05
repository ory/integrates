# Akamai EdgeWorkers

> **Maintained by:** Community contributors

[Akamai EdgeWorkers](https://www.akamai.com/products/serverless-computing-edgeworkers) is Akamai's V8-isolate serverless runtime. Validate Ory Network session tokens and JWTs at the Akamai edge so requests never round-trip to origin when the token is invalid, and so origin services receive a trusted `X-User-Id` header.

**Type:** session-validation (edge token validation pattern — see [`edge-token-validation/cloudflare-workers`](../cloudflare-workers/) for the canonical reference implementation)
**Docs page:** [ory.com/docs/integrates-with/edge-token-validation/akamai-edgeworkers](https://www.ory.com/docs/integrates-with/edge-token-validation/akamai-edgeworkers)

## Pattern

Same shape as the Cloudflare Workers reference but using Akamai EdgeWorkers' constraints (no Node fetch by default; use the EdgeWorkers `httpRequest` API; V8 isolate without Web Crypto on older runtimes).

1. EdgeWorker fires on `onClientRequest`.
2. Reads the session cookie or `Authorization: Bearer` header.
3. For JWTs (Hydra-issued): verify signature against cached Ory JWKS using EdgeWorkers' Crypto API.
4. For session cookies (Kratos): call `https://<project>.projects.oryapis.com/sessions/whoami` via `httpRequest`. Cache the response by cookie hash for 30-60s in EdgeKV (or per-isolate memory if EdgeKV isn't available).
5. On valid: inject `X-User-Id` header into the request before it proceeds to origin.
6. On invalid: respond with 401 directly from the edge.

## Differences from the Cloudflare reference

- **No `fetch()` global** — use the EdgeWorkers `httpRequest` API.
- **`EdgeKV`** for cross-edge cache; falls back to per-isolate `Map` if not provisioned.
- **CPU budget** is stricter (typically 50ms wall-clock); JWKS verification fits comfortably but `whoami` calls eat into this budget.
- **Akamai Property Manager** wires the EdgeWorker to a request behavior on the relevant hostname / path.

## Status

Community / proposed — no dedicated Ory documentation. Pattern is universal; reference implementation lives at [`edge-token-validation/cloudflare-workers`](../cloudflare-workers/).

## License

Apache-2.0. (Configuration + minimal EdgeWorker code — no first-party Ory handler in this directory.)
