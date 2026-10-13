# Cloudflare Workers — Ory Session & JWT Validation at the Edge

Validate Ory Network sessions and JWT access tokens at Cloudflare's edge, before requests reach your origin server.

**Docs page:** [ory.com/docs/integrates-with/edge-token-validation/cloudflare-workers](https://www.ory.com/docs/integrates-with/edge-token-validation/cloudflare-workers)

## Overview

This integration deploys a Cloudflare Worker ([`src/worker.ts`](src/worker.ts)) that intercepts incoming requests, validates Ory sessions or Bearer JWTs against your Ory Network project, and forwards authenticated requests to your origin with identity headers. Unauthenticated requests are rejected at the edge.

| Feature | Details |
|---------|---------|
| Platform | Cloudflare Workers |
| Runtime | V8 isolates (TypeScript, Web Crypto) |
| Validation modes | JWT access token (local, against the JWKS); session cookie or session token (`/sessions/whoami`) |
| Caching | JWKS and active sessions in isolate memory |
| Ory Platform | Ory Network (managed cloud) |

## Architecture

```
Client
  |
  | (request with ory_session_<slug> cookie, X-Session-Token, or Bearer token)
  v
Cloudflare Edge (Worker)
  |
  |-- 1. Remove client-supplied identity headers
  |-- 2. Validate the credential:
  |     - Bearer JWT       → verify against the JWKS and check alg, iss, aud, exp, nbf
  |     - Session cookie   → call Ory /sessions/whoami
  |     - Session token    → call Ory /sessions/whoami
  |-- 3. Reject with 401 if invalid (503 if Ory is unreachable)
  |-- 4. Forward to origin with X-User-Id and related headers
  v
Origin Server
```

## Prerequisites for JWT validation

Ory issues opaque access tokens (`ory_at_…`) by default, and the `aud` claim is empty unless the client requests an audience. To issue JWTs that the Worker can verify:

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

The token's `iss` claim is `https://<project>.projects.oryapis.com`, without a trailing slash. For the client credentials grant, `sub` is the client ID. See [JWT access tokens](https://www.ory.com/docs/oauth2-oidc/jwt-access-token).

## What the Worker checks

- **JWTs:** `alg` must be `RS256`. The key is selected by the token's `kid`. When the `kid` isn't in the cached key set, the Worker fetches the JWKS again (at most once every 30 seconds) before rejecting the token. `iss` must equal `JWT_ISSUER` (default: `ORY_SDK_URL`), `aud` must contain `JWT_AUDIENCE`, `exp` must be in the future, and `nbf`, when present, must not be in the future. Without `JWT_AUDIENCE`, every JWT is rejected.
- **Sessions:** cookies named `ory_session_*` (Ory Network, where the suffix is your project slug without dashes) or `ory_kratos_session` (self-hosted Kratos), or a session token (`ory_st_…`) in `X-Session-Token` or as a Bearer token. Only the `ory_` cookies are sent to Ory. Active sessions are cached for 30 seconds under a SHA-256 hash of the credential, in isolate memory, bounded to 1,000 entries. A revoked session can therefore pass for up to 30 seconds.
- **Identity headers:** `X-User-Id`, `X-User-Email`, `X-User-Name`, `X-Session-Id`, `X-Auth-AAL`, and `X-User-Metadata` are removed from every incoming request, including public paths, and set only from validated data. `X-User-Metadata` is JSON with non-ASCII characters escaped. `X-User-Email` and `X-User-Name` are omitted when they contain non-ASCII characters.

## Configuration

[`wrangler.toml`](wrangler.toml):

| Variable | Description |
|----------|-------------|
| `ORY_SDK_URL` | Your project URL, for example `https://<project>.projects.oryapis.com`. |
| `JWT_AUDIENCE` | The audience your API requires. Required for JWT validation. |
| `JWT_ISSUER` | Optional. Defaults to `ORY_SDK_URL`. Set it when tokens carry a custom-domain issuer. |
| `PUBLIC_PATHS` | Comma-separated paths that skip authentication. Matches the exact path or a prefix followed by `/`. |
| `LOGIN_REDIRECT_URL` | Optional. Browser requests (`Accept: text/html`) without a valid session are redirected here with `return_to`. |

## Develop and deploy

```bash
npm install
npm run dev        # wrangler dev, runs src/worker.ts
npm run typecheck
npx wrangler login
npm run deploy     # wrangler deploy
```

## Testing

```bash
# Session cookie
curl -v https://your-worker.your-subdomain.workers.dev/api/me \
  -H "Cookie: ory_session_<slug>=<cookie-value>"

# Session token
curl -v https://your-worker.your-subdomain.workers.dev/api/me \
  -H "X-Session-Token: <ory_st_...>"

# JWT access token
curl -v https://your-worker.your-subdomain.workers.dev/api/me \
  -H "Authorization: Bearer <jwt-access-token>"

# Public path (passes through)
curl -v https://your-worker.your-subdomain.workers.dev/health

# Unauthenticated (401)
curl -v https://your-worker.your-subdomain.workers.dev/api/me
```

## Performance considerations

| Concern | Mitigation |
|---------|-----------|
| JWKS fetch latency | Cached per isolate for one hour; the subrequest is edge-cached for five minutes |
| `/sessions/whoami` latency | Active sessions cached per isolate for 30 seconds; use JWT mode for the lowest latency |
| Worker CPU time | Workers on the Free plan get 10 ms of CPU time per request. Waiting on `fetch()` doesn't count toward CPU time |

## Security considerations

- Use HTTPS for `ORY_SDK_URL`.
- Make sure the origin is reachable only through the Worker, for example with IP allowlisting or mTLS, so clients can't bypass it and set identity headers themselves.
- The Worker forwards the original `Authorization` and `Cookie` headers to origin. Remove them in `forward()` if your origin doesn't need them.

## References

- [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
- [Ory session management](https://www.ory.com/docs/kratos/session-management/overview)
- [Ory JWT access tokens](https://www.ory.com/docs/oauth2-oidc/jwt-access-token)
