# Fastly Compute@Edge

> **Maintained by:** Community contributors

[Fastly Compute@Edge](https://www.fastly.com/products/edge-compute) is Fastly's WASM-based serverless runtime — Rust, JavaScript, AssemblyScript, Go (TinyGo) compiled to WebAssembly. Validate Ory Network session tokens and JWTs at the Fastly edge so requests never round-trip to origin when invalid, and so origin services receive a trusted `X-User-Id` header.

**Type:** session-validation (edge token validation pattern — see [`edge-token-validation/cloudflare-workers`](../cloudflare-workers/) for the canonical reference implementation)
**Docs page:** No dedicated Fastly page on ory.com/docs.

## Pattern

Same shape as the Cloudflare Workers reference but compiled to WASM and using Fastly's host backends API.

1. WASM module fires on every request.
2. Reads the session cookie or `Authorization: Bearer` header from the incoming request.
3. For JWTs (Hydra-issued): verify against cached Ory JWKS (use the language's standard JWT library compiled to WASM).
4. For session cookies (Kratos): call `https://<project>.projects.oryapis.com/sessions/whoami` via a registered **Fastly backend**. Cache the response in **Fastly KV Store** keyed by cookie hash for 30-60s.
5. On valid: inject `X-User-Id` header and forward to origin backend.
6. On invalid: synthesize a 401 response at the edge.

## Fastly-specific bits

- **Backend registration** — the Ory hostname must be registered as a named Fastly backend in the service config; Compute@Edge cannot make ad-hoc outbound calls.
- **KV Store** for cross-region cache; per-execution memory only persists for one request.
- **Edge dictionaries** for non-secret config (Ory project URL, audience IDs); **Edge secrets** for the JWKS pinning info or service tokens.
- **Rust** is the most performant runtime; **JavaScript** (via Quick.js) is the easiest path if you're porting from the Cloudflare reference.

## Status

Community / proposed — no dedicated Ory documentation. Pattern is universal; reference implementation lives at [`edge-token-validation/cloudflare-workers`](../cloudflare-workers/).

## License

Apache-2.0. (Configuration + minimal Compute@Edge code — no first-party Ory handler in this directory.)
