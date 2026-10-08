# AWS API Gateway

> **Maintained by:** Community contributors

[AWS API Gateway](https://aws.amazon.com/api-gateway/) — managed REST/HTTP/WebSocket gateway. Validate Ory-issued JWTs at the gateway layer using a **Lambda authorizer** (formerly "custom authorizer") that calls Ory's JWKS endpoint, before requests reach backend services.

**Type:** config (Lambda authorizer + API Gateway config — small code in the authorizer)
**Docs page:** [ory.com/docs/integrates-with/api-gateways/aws-api-gateway](https://www.ory.com/docs/integrates-with/api-gateways/aws-api-gateway)

## Pattern

API Gateway invokes the Lambda authorizer on each request → authorizer fetches and caches Ory's JWKS → verifies signature, issuer, audience → returns an IAM policy (Allow or Deny). API Gateway caches the policy by token for `authorizerResultTtlInSeconds` (typically 300s) to avoid invoking the authorizer on every request.

## Prerequisites for JWT validation

Ory issues opaque access tokens (`ory_at_…`) by default, and the `aud` claim is empty unless the client requests an audience. To issue JWTs that API Gateway can verify:

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

1. Deploy a Lambda authorizer (Node.js or Python) that:
   - Pulls JWT from `Authorization: Bearer <token>` header.
   - Verifies against JWKS at `https://<project>.projects.oryapis.com/.well-known/jwks.json` (cache in module scope, refresh on `kid` miss).
   - Checks that `iss` is `https://<project>.projects.oryapis.com`, that `aud` contains your API's audience, and that `exp` is in the future. Pin the algorithm to `RS256`.
   - Returns the IAM policy + principalId (= JWT `sub`).
2. Wire as a **Token authorizer** (REST API) or **Lambda authorizer** (HTTP API) on the API.
3. Configure `authorizerResultTtlInSeconds` (REST) or `enableSimpleResponses: false` + `resultsCacheTtlInSeconds` (HTTP) for caching.

## Notable

- **HTTP API** has native JWT authorizers that don't need a Lambda — set the issuer to `https://<project>.projects.oryapis.com` and the audience to your API's audience. Lambda authorizer is only needed when you require custom validation logic beyond standard JWT verification.
- The authorizer's IAM policy controls the **resource pattern** that's allowed; emit a wildcard policy for the API to keep things simple, or a tight per-method policy for stricter authorization.
- Cold-start latency matters — keep the authorizer minimal; ship JWKS verification with a lean library like `aws-jwt-verify`.

## Status

Community / proposed — no dedicated Ory documentation. Pattern is universal.

## License

Apache-2.0. (Configuration + minimal authorizer code — no first-party Ory handler in this directory.)
