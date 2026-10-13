# Envoy

> **Maintained by:** Community contributors

[Envoy](https://www.envoyproxy.io/) is a CNCF cloud-native L7 proxy — the data plane behind many service meshes and API gateways. Validate Ory-issued JWTs or Kratos sessions at the Envoy layer using the native **`jwt_authn`** filter (for OAuth2 access tokens from Hydra) or the **`ext_authz`** filter (delegating to Ory Oathkeeper or a small validator for Kratos session checks).

**Type:** config (Envoy HTTP-filter configuration — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/api-gateways/envoy](https://www.ory.com/docs/integrates-with/api-gateways/envoy)

> **Status: community / proposed — shape still being defined.** This entry documents the standard patterns; a full reference configuration may land later.

## Prerequisites for JWT validation

Ory issues opaque access tokens (`ory_at_…`) by default, and the `aud` claim is empty unless the client requests an audience. To issue JWTs that Envoy can verify:

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

## Two paths

### Path A — OAuth2 access token validation (`jwt_authn` filter)

For Ory Hydra-issued JWTs:

1. Add the **`jwt_authn`** HTTP filter to the listener's filter chain.
2. Define a provider with:
   - `remote_jwks.http_uri` → `https://<project>.projects.oryapis.com/.well-known/jwks.json`.
   - `issuer` → `https://<project>.projects.oryapis.com`, without a trailing slash.
   - `audiences` → the audience you set on the Ory OAuth2 client, for example `https://api.example.com`.
   - `remote_jwks.http_uri.cluster` → a cluster that reaches the project over TLS **with certificate validation**. Envoy doesn't verify upstream certificates unless the cluster's `UpstreamTlsContext` sets `common_tls_context.validation_context` (a `trusted_ca` bundle plus a `match_typed_subject_alt_names` DNS matcher for the project hostname) and `sni`. See the [docs page](https://www.ory.com/docs/integrates-with/api-gateways/envoy) for a complete listener and cluster example.
3. Envoy caches the JWKS and refreshes on `cache_duration`.
4. Optionally forward verified claims upstream via `payload_in_metadata` for downstream authorization.

### Path B — Kratos session validation (`ext_authz` filter)

For end-user session cookies / tokens from Kratos:

1. Add the **`ext_authz`** HTTP filter pointing at Ory Oathkeeper (or a small validator service).
2. The authorizer calls `https://<project>.projects.oryapis.com/sessions/whoami` with the session cookie.
3. On 200, inject identity headers downstream (`X-User-Id`, `X-User-Email`) and forward; on 401, reject at the edge. `whoami` sets only the `X-Kratos-Authenticated-Identity-Id` response header, so the authorizer reads other identity fields from the response body. Configure `ext_authz` to overwrite or remove identity headers the client sends.

## Notable

- The same configuration applies whether Envoy runs standalone, as an Istio sidecar/gateway, or as the data plane under a managed gateway.
- For Kratos session checks, cache the `whoami` result per session to avoid hammering Ory on every request.
- [Tetrate Agent Router Enterprise](../../agent-identity/tetrate/) is built on **Envoy AI Gateway** and applies this token-at-the-edge pattern to AI-agent traffic.

## Status

Community / proposed — no dedicated Ory documentation; integration shape still being defined.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
