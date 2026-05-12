# AWS API Gateway

> **Maintained by:** Community contributors

[AWS API Gateway](https://aws.amazon.com/api-gateway/) — managed REST/HTTP/WebSocket gateway. Validate Ory-issued JWTs at the gateway layer using a **Lambda authorizer** (formerly "custom authorizer") that calls Ory's JWKS endpoint, before requests reach backend services.

**Type:** config (Lambda authorizer + API Gateway config — small code in the authorizer)
**Docs page:** No dedicated AWS API Gateway page on ory.com/docs. Standard JWT-at-the-edge pattern.

## Pattern

API Gateway invokes the Lambda authorizer on each request → authorizer fetches and caches Ory's JWKS → verifies signature, issuer, audience → returns an IAM policy (Allow or Deny). API Gateway caches the policy by token for `authorizerResultTtlInSeconds` (typically 300s) to avoid invoking the authorizer on every request.

## Setup outline

1. Deploy a Lambda authorizer (Node.js or Python) that:
   - Pulls JWT from `Authorization: Bearer <token>` header.
   - Verifies against JWKS at `https://<project>.projects.oryapis.com/.well-known/jwks.json` (cache in module scope, refresh on `kid` miss).
   - Returns the IAM policy + principalId (= JWT `sub`).
2. Wire as a **Token authorizer** (REST API) or **Lambda authorizer** (HTTP API) on the API.
3. Configure `authorizerResultTtlInSeconds` (REST) or `enableSimpleResponses: false` + `resultsCacheTtlInSeconds` (HTTP) for caching.

## Notable

- **HTTP API** has native JWT authorizers that don't need a Lambda — point them at Ory's issuer URL directly. Lambda authorizer is only needed when you require custom validation logic beyond standard JWT verification.
- The authorizer's IAM policy controls the **resource pattern** that's allowed; emit a wildcard policy for the API to keep things simple, or a tight per-method policy for stricter authorization.
- Cold-start latency matters — keep the authorizer minimal; ship JWKS verification with a lean library like `aws-jwt-verify`.

## Status

Community / proposed — no dedicated Ory documentation. Pattern is universal.

## License

Apache-2.0. (Configuration + minimal authorizer code — no first-party Ory handler in this directory.)
