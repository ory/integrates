# Google Apigee

> **Maintained by:** Community contributors

[Google Apigee](https://cloud.google.com/apigee) is an enterprise API management platform — API proxying, security, analytics, monetization. Validate Ory-issued JWTs at the gateway layer with Apigee's **VerifyJWT** policy + a SharedFlow for token validation, using Ory Network's JWKS endpoint.

**Type:** config (Apigee policy + shared flow — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/api-gateways/apigee](https://www.ory.com/docs/integrates-with/api-gateways/apigee)

## Pattern

Apigee intercepts the API request → SharedFlow runs VerifyJWT against `https://<project>.projects.oryapis.com/.well-known/jwks.json` → on valid JWT, proxy to backend; on invalid, return 401. Apigee caches the JWKS automatically.

## Setup outline

1. Create an Apigee SharedFlow with a **VerifyJWT** policy:
   - Algorithm: RS256.
   - PublicKey JWKS URL: `https://<project>.projects.oryapis.com/.well-known/jwks.json`.
   - Issuer: `https://<project>.projects.oryapis.com`.
   - Audience: your API's audience identifier (configured in Ory's OAuth2 client).
2. Attach the SharedFlow to your API proxy's PreFlow.
3. In your application, configure clients to call the API with the bearer token issued by Ory's OAuth2 server (Hydra).

## Notable

- JWKS rotation: Apigee caches the JWKS by URL; tune `CacheTTLInSeconds` on the VerifyJWT policy to balance freshness vs. KMS calls.
- Apigee's KVM (Key Value Map) can hold per-environment audience values without redeploying the shared flow.
- For finer-grained authorization (claim-based access control), add an `AssignMessage` or `JavaScript` policy after VerifyJWT to inspect the JWT claims.

## Status

Community / proposed — no dedicated Ory documentation. Pattern is universal across API gateways.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
