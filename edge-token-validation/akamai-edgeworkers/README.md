# Akamai EdgeWorkers

> **Maintained by:** Community contributors

[Akamai EdgeWorkers](https://www.akamai.com/products/serverless-computing-edgeworkers) is Akamai's V8-isolate serverless runtime. Validate Ory Network session tokens and JWTs at the Akamai edge so requests never round-trip to origin when the token is invalid, and so origin services receive a trusted `X-User-Id` header.

**Type:** session-validation (edge token validation pattern — see [`edge-token-validation/cloudflare-workers`](../cloudflare-workers/) for the canonical reference implementation)
**Docs page:** [ory.com/docs/integrates-with/edge-token-validation/akamai-edgeworkers](https://www.ory.com/docs/integrates-with/edge-token-validation/akamai-edgeworkers)

## Prerequisites for JWT validation

Ory issues opaque access tokens (`ory_at_…`) by default, and the `aud` claim is empty unless the client requests an audience. To issue JWTs that the EdgeWorker can verify:

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

Same shape as the Cloudflare Workers reference but using Akamai EdgeWorkers' constraints (no Node fetch by default; use the EdgeWorkers `httpRequest` API; V8 isolate without Web Crypto on older runtimes).

1. EdgeWorker fires on `onClientRequest`.
2. Reads the session cookie or `Authorization: Bearer` header.
3. For JWTs (Hydra-issued): verify signature against cached Ory JWKS using EdgeWorkers' Crypto API.
4. For session cookies (Kratos): call `https://<project>.projects.oryapis.com/sessions/whoami` via `httpRequest`. Cache the response by cookie hash for 30-60s in EdgeKV (or per-isolate memory if EdgeKV isn't available).
5. On valid: inject `X-User-Id` header into the request before it proceeds to origin.
6. On invalid: respond with 401 directly from the edge.

Apply the same validation as the [Cloudflare reference](../cloudflare-workers/#what-the-worker-checks): pin `RS256`, select the key by `kid` and refetch the JWKS on an unknown `kid`, verify `iss` (no trailing slash), `aud`, `exp`, and `nbf`, remove client-supplied identity headers before forwarding, and cache `whoami` responses only under a key derived from the session cookie or token. On Ory Network the session cookie is `ory_session_<slug>`, where `<slug>` is your project slug without dashes.

## Differences from the Cloudflare reference

- **No `fetch()` global** — use the EdgeWorkers `httpRequest` API.
- **`EdgeKV`** for cross-edge cache; falls back to per-isolate `Map` if not provisioned.
- **Limits depend on the resource tier.** Each event handler gets 10 ms (Basic Compute), 20 ms (Dynamic Compute), or 70 ms (Enterprise Compute) of CPU time and a capped number of HTTP sub-requests. Each `whoami` call is a sub-request.
- **Akamai Property Manager** wires the EdgeWorker to a request behavior on the relevant hostname / path.

## Status

Community / proposed — no dedicated Ory documentation. Pattern is universal; reference implementation lives at [`edge-token-validation/cloudflare-workers`](../cloudflare-workers/).

## License

Apache-2.0. (Configuration + minimal EdgeWorker code — no first-party Ory handler in this directory.)
