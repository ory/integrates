# Kong API Gateway

> **Maintained by:** Community contributors

[Kong Gateway](https://konghq.com/) is a cloud-native API gateway — traffic management, auth, rate limiting, observability. Validate Ory-issued JWTs or session tokens at the gateway using Kong's **jwt** plugin (for OAuth2 access tokens from Hydra) or a custom plugin (for Kratos session validation).

**Type:** config (Kong plugin configuration — no webhook code)
**Docs page:** No dedicated Kong page on ory.com/docs. Standard JWT-at-the-edge pattern; the Ory side is just JWKS exposure or `/sessions/whoami`.

## Two paths

### Path A — OAuth2 access token validation (Kong's `jwt` plugin)

For Ory Hydra-issued JWTs:

1. Enable the **jwt** plugin on the relevant Service / Route.
2. Create a Kong **Consumer** representing the Ory issuer.
3. Add a **JWT credential** to the consumer with:
   - `algorithm: RS256`.
   - `rsa_public_key`: from the Ory JWKS (or use the `jwt-keycloak` / `jwt-signer` community plugins for JWKS auto-fetch).
4. Configure the plugin's `claims_to_verify` (typically `exp`) and `key_claim_name` (typically `iss` or `kid`).

### Path B — Kratos session validation (custom plugin)

For end-user session cookies / tokens from Kratos:

1. Use Kong's **request-transformer** + **pre-function** plugins (or a small custom plugin) to call `https://<project>.projects.oryapis.com/sessions/whoami` with the user's session cookie.
2. On 200, inject identity headers downstream (`X-User-Id`, `X-User-Email`) and forward.
3. On 401, return 401 without forwarding.

Kong Enterprise's **OIDC** plugin handles much of Path A automatically with JWKS auto-discovery.

## Notable

- Kong supports **JWKS auto-refresh** via `jwt-signer` or `jwt-keycloak` community plugins — preferred over manually loading public keys.
- For Kratos session validation, cache the `whoami` response per session cookie to avoid hammering Ory on every request (Kong's `proxy-cache` plugin or a custom Redis-backed cache).
- Rate-limit at the gateway, not the backend — Kong's `rate-limiting` plugin keyed by the validated `sub` claim is the cleanest pattern.

## Status

Community / proposed — no dedicated Ory documentation.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
