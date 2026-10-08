# Kong API Gateway

> **Maintained by:** Community contributors

[Kong Gateway](https://konghq.com/) is a cloud-native API gateway — traffic management, auth, rate limiting, observability. Validate Ory-issued JWTs or session tokens at the gateway using Kong's **jwt** plugin (for OAuth2 access tokens from Hydra) or a custom plugin (for Kratos session validation).

**Type:** config (Kong plugin configuration — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/api-gateways/kong](https://www.ory.com/docs/integrates-with/api-gateways/kong)

## Prerequisites for JWT validation

Ory issues opaque access tokens (`ory_at_…`) by default, and the `aud` claim is empty unless the client requests an audience. To issue JWTs that Kong can verify:

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

The token's `iss` claim is `https://<project>.projects.oryapis.com`, without a trailing slash. The JWKS can hold more than one key, so the key must match the token's `kid` header. For the client credentials grant, `sub` is the client ID. See [JWT access tokens](https://www.ory.com/docs/oauth2-oidc/jwt-access-token).

## Path A — OAuth2 access token validation (Kong's `jwt` plugin)

[`config/kong.yaml`](config/kong.yaml) and [`config/docker-compose.yaml`](config/docker-compose.yaml) run Kong 3.9 in DB-less mode. The open source **jwt** plugin verifies the RS256 signature and `exp`. It does not fetch JWKS, so you store the public key on a Consumer's JWT credential. A **post-function** then requires your API's audience and `nbf`, and sets `X-User-Id` to the token's `sub`.

1. Convert the signing key from the JWKS to PEM. This picks the key whose `kid` matches an access token's header:

   ```bash
   export ACCESS_TOKEN=<access-token>
   curl -s https://<project>.projects.oryapis.com/.well-known/jwks.json | node -e '
   const { createPublicKey } = require("node:crypto")
   const { kid } = JSON.parse(Buffer.from(process.env.ACCESS_TOKEN.split(".")[0], "base64url"))
   const { keys } = JSON.parse(require("node:fs").readFileSync(0, "utf8"))
   const jwk = keys.find((k) => k.kid === kid)
   process.stdout.write(createPublicKey({ key: jwk, format: "jwk" }).export({ type: "spki", format: "pem" }))
   '
   ```

2. In `kong.yaml`, paste the complete PEM under `rsa_public_key`, set `key` to the issuer (`https://<project>.projects.oryapis.com`), and replace `https://api.example.com` with your audience. The plugin selects the credential by the token's `iss` claim, because `key_claim_name` defaults to `iss`.
3. Allow the post-function to load Kong's JWT parser in the Lua sandbox: `untrusted_lua_sandbox_requires = kong.plugins.jwt.jwt_parser`. The compose file sets it with `KONG_UNTRUSTED_LUA_SANDBOX_REQUIRES`. If you already allow other modules, append this one.
4. `docker compose up` from `config/`.

Keep both plugins on every protected route and don't enable anonymous access. Post-Function runs after other access plugins, so don't combine this setup with plugins that produce a response, such as Proxy Cache.

Kong selects the credential by `iss`, not by `kid`, and each credential holds one key. When Ory signs tokens with a different key from the JWKS, Kong rejects them until you update `rsa_public_key`. To pick up keys automatically, use Kong Enterprise's **OpenID Connect** plugin — see [`config/kong-oidc-enterprise.yaml`](config/kong-oidc-enterprise.yaml).

## Path B — Kratos session validation (custom plugin)

For end-user session cookies / tokens from Kratos:

1. Write a small custom plugin or a `pre-function` that calls `https://<project>.projects.oryapis.com/sessions/whoami` with the user's session cookie or token.
2. On 200, set identity headers downstream (`X-User-Id`, `X-User-Email`) from the response body and forward. Always overwrite or clear these headers so a client can't supply them.
3. On 401, return 401 without forwarding.

`whoami` sets only the `X-Kratos-Authenticated-Identity-Id` response header, so read other identity fields from the response body.

## Notable

- To avoid calling Ory on every request, cache the `whoami` result per session inside your plugin. Kong's `proxy-cache` plugin caches upstream responses, not requests a plugin makes.
- With the **jwt** plugin, every token from one issuer maps to the same Consumer, so `rate-limiting` with `limit_by: consumer` limits all callers together, not each `sub`.

## Status

Community / proposed — no dedicated Ory documentation.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
