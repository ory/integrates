# Fastly Compute@Edge

> **Maintained by:** Community contributors

[Fastly Compute@Edge](https://www.fastly.com/products/edge-compute) is Fastly's WASM-based serverless runtime — Rust, JavaScript, AssemblyScript, Go (TinyGo) compiled to WebAssembly. Validate Ory Network session tokens and JWTs at the Fastly edge so requests never round-trip to origin when invalid, and so origin services receive a trusted `X-User-Id` header.

**Type:** session-validation (edge token validation pattern — see [`edge-token-validation/cloudflare-workers`](../cloudflare-workers/) for the canonical reference implementation)
**Docs page:** [ory.com/docs/integrates-with/edge-token-validation/fastly-compute](https://www.ory.com/docs/integrates-with/edge-token-validation/fastly-compute)

## Prerequisites for JWT validation

Ory issues opaque access tokens (`ory_at_…`) by default, and the `aud` claim is empty unless the client requests an audience. To issue JWTs that the Compute service can verify:

```bash
# 1. Switch the project to JWT access tokens.
ory patch oauth2-config --project <project-id> --replace '/strategies/access_token="jwt"'

# 2. Create a client that may request your API's audience.
ory create oauth2-client --project <project-id> --name "<client-name>" \
  --grant-type client_credentials --audience https://api.example.com

# 3. Request the audience when you get a token.
curl https://<project>.projects.oryapis.com/oauth2/token -u "<client-id>:<client-secret>" \
  -d grant_type=client_credentials -d audience=https://api.example.com
```

The token's `iss` claim is `https://<project>.projects.oryapis.com`, without a trailing slash. The JWKS can hold more than one key, so select the key that matches the token's `kid` header. For the client credentials grant, `sub` is the client ID. See [JWT access tokens](https://www.ory.com/docs/oauth2-oidc/jwt-access-token).

## Pattern

Same shape as the Cloudflare Workers reference but compiled to WASM and using Fastly's host backends API.

1. WASM module fires on every request.
2. Reads the session cookie or `Authorization: Bearer` header from the incoming request.
3. For JWTs (Hydra-issued): verify against cached Ory JWKS (use the language's standard JWT library compiled to WASM).
4. For session cookies (Kratos): call `https://<project>.projects.oryapis.com/sessions/whoami` via a registered **Fastly backend**. Cache the response in **Fastly KV Store** keyed by cookie hash for 30-60s.
5. On valid: inject `X-User-Id` header and forward to origin backend.
6. On invalid: synthesize a 401 response at the edge.

Apply the same validation as the [Cloudflare reference](../cloudflare-workers/#what-the-worker-checks): pin `RS256`, select the key by `kid` and refetch the JWKS on an unknown `kid`, verify `iss` (no trailing slash), `aud`, `exp`, and `nbf`, remove client-supplied identity headers before forwarding, and cache `whoami` responses only under a key derived from the session cookie or token. On Ory Network the session cookie is `ory_session_<slug>`, where `<slug>` is your project slug without dashes.

## Fastly-specific bits

- **Backend registration** — register the Ory hostname as a named Fastly backend in the service config. To create backends at runtime instead, have Fastly enable dynamic backends for the service, then enable them in your application with the relevant SDK setting. See [Fastly's backend guide](https://www.fastly.com/documentation/guides/integrations/non-fastly-services/developer-guide-backends/).
- **KV Store** for cross-region cache; per-execution memory only persists for one request.
- **Config Store** for non-secret config (Ory project URL, audience IDs); **Secret Store** for secrets such as service tokens.
- **Rust** is the most performant runtime; **JavaScript** (SpiderMonkey compiled to WebAssembly) is the easiest path if you're porting from the Cloudflare reference.

## Status

Community / proposed — no dedicated Ory documentation. Pattern is universal; reference implementation lives at [`edge-token-validation/cloudflare-workers`](../cloudflare-workers/).

## License

Apache-2.0. (Configuration + minimal Compute@Edge code — no first-party Ory handler in this directory.)
