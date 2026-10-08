# Google Apigee

> **Maintained by:** Community contributors

[Google Apigee](https://cloud.google.com/apigee) is an enterprise API management platform — API proxying, security, analytics, monetization. Validate Ory-issued JWTs at the gateway layer with Apigee's **VerifyJWT** policy + a SharedFlow for token validation, using Ory Network's JWKS endpoint.

**Type:** config (Apigee policy + shared flow — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/api-gateways/apigee](https://www.ory.com/docs/integrates-with/api-gateways/apigee)

## Pattern

Apigee intercepts the API request → SharedFlow runs VerifyJWT against `https://<project>.projects.oryapis.com/.well-known/jwks.json` → on valid JWT, proxy to backend; on invalid, return 401. Apigee caches the JWKS for 300 seconds.

## Prerequisites for JWT validation

Ory issues opaque access tokens (`ory_at_…`) by default, and the `aud` claim is empty unless the client requests an audience. To issue JWTs that Apigee can verify:

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

## Setup outline

1. Create an Apigee SharedFlow with a **VerifyJWT** policy:
   - Algorithm: RS256.
   - PublicKey JWKS URL: `https://<project>.projects.oryapis.com/.well-known/jwks.json`.
   - Issuer: `https://<project>.projects.oryapis.com`.
   - Audience: the audience you set on the Ory OAuth2 client, for example `https://api.example.com`.
2. Attach the SharedFlow to your API proxy's PreFlow.
3. In your application, configure clients to call the API with the bearer token issued by Ory's OAuth2 server (Hydra).

## Notable

- JWKS rotation: Apigee caches a JWKS fetched from a URL for 300 seconds and selects the key that matches the token's `kid` header.
- Apigee's KVM (Key Value Map) can hold per-environment audience values without redeploying the shared flow.
- For finer-grained authorization (claim-based access control), add an `AssignMessage` or `JavaScript` policy after VerifyJWT to inspect the JWT claims.

## Status

Community / proposed — no dedicated Ory documentation. Pattern is universal across API gateways.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
