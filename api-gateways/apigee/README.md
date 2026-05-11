# Google Apigee + Ory Network Integration

## Overview

[Google Apigee](https://cloud.google.com/apigee) is an enterprise API management platform that provides API proxying, security, analytics, and monetization. This integration uses Apigee's **VerifyJWT** and **SharedFlow** policies to validate Ory-issued JWTs at the gateway layer using Ory Network's JWKS endpoint.

## Integration Architecture

Apigee intercepts API requests and applies a shared flow that validates the Ory JWT before proxying to the target backend. The JWKS is fetched from Ory Network and cached by Apigee.

```
Client ──► Apigee Edge/X ──► Target Backend
               │
               ├── SharedFlow: ory-jwt-validation
               │     ├── ExtractVariables (parse Authorization header)
               │     ├── ServiceCallout (fetch JWKS from Ory — cached)
               │     ├── VerifyJWT (validate signature + claims)
               │     └── AssignMessage (set upstream headers)
               │
               └── On failure → 401 Unauthorized
```

**Flow sequence:**

1. Client sends `Authorization: Bearer <ory-jwt>`.
2. Apigee's shared flow extracts the token.
3. A ServiceCallout fetches (and caches) the JWKS from Ory's `/.well-known/jwks.json`.
4. The VerifyJWT policy validates the signature, issuer, expiration, and optionally the audience.
5. On success, identity claims are extracted and forwarded as headers to the target.
6. On failure, a 401 response is returned.

## Configuration

### Prerequisites

- Apigee X (Google Cloud) or Apigee Edge
- An Ory Network project with OAuth2/OIDC enabled
- Your Ory project slug (e.g., `my-project`)

### Shared Flow Structure

```
sharedflows/
  ory-jwt-validation/
    sharedflowbundle/
      policies/
        EV-ExtractBearerToken.xml
        SC-FetchOryJWKS.xml
        CP-CacheOryJWKS.xml
        LP-LookupCachedJWKS.xml
        JWT-VerifyOryToken.xml
        AM-SetUpstreamHeaders.xml
        RF-Unauthorized.xml
      sharedflows/
        default.xml
      ory-jwt-validation.xml
```

### Policy XML Files

#### 1. Extract Bearer Token (`EV-ExtractBearerToken.xml`)

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ExtractVariables name="EV-ExtractBearerToken">
    <DisplayName>Extract Bearer Token</DisplayName>
    <Source>request</Source>
    <Header name="Authorization">
        <Pattern ignoreCase="true">Bearer {jwt_token}</Pattern>
    </Header>
    <VariablePrefix>ory</VariablePrefix>
    <IgnoreUnresolvedVariables>false</IgnoreUnresolvedVariables>
</ExtractVariables>
```

#### 2. Lookup Cached JWKS (`LP-LookupCachedJWKS.xml`)

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<LookupCache name="LP-LookupCachedJWKS">
    <DisplayName>Lookup Cached JWKS</DisplayName>
    <CacheKey>
        <Prefix>ory-jwks</Prefix>
        <KeyFragment>jwks-keys</KeyFragment>
    </CacheKey>
    <Scope>Global</Scope>
    <AssignTo>ory.jwks_response</AssignTo>
</LookupCache>
```

#### 3. Fetch JWKS from Ory (`SC-FetchOryJWKS.xml`)

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ServiceCallout name="SC-FetchOryJWKS">
    <DisplayName>Fetch Ory JWKS</DisplayName>
    <Condition>ory.jwks_response = null</Condition>
    <Request>
        <Set>
            <Verb>GET</Verb>
        </Set>
    </Request>
    <Response>ory.jwks_response</Response>
    <HTTPTargetConnection>
        <URL>https://{project-slug}.projects.oryapis.com/.well-known/jwks.json</URL>
    </HTTPTargetConnection>
</ServiceCallout>
```

#### 4. Cache JWKS Response (`CP-CacheOryJWKS.xml`)

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<PopulateCache name="CP-CacheOryJWKS">
    <DisplayName>Cache Ory JWKS</DisplayName>
    <Condition>ory.jwks_response != null</Condition>
    <CacheKey>
        <Prefix>ory-jwks</Prefix>
        <KeyFragment>jwks-keys</KeyFragment>
    </CacheKey>
    <Scope>Global</Scope>
    <Source>ory.jwks_response</Source>
    <ExpirySettings>
        <TimeoutInSec>3600</TimeoutInSec>  <!-- Cache JWKS for 1 hour -->
    </ExpirySettings>
</PopulateCache>
```

#### 5. Verify JWT (`JWT-VerifyOryToken.xml`)

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<VerifyJWT name="JWT-VerifyOryToken">
    <DisplayName>Verify Ory JWT</DisplayName>
    <Algorithm>RS256</Algorithm>
    <Source>ory.jwt_token</Source>

    <!-- Use JWKS from Ory -->
    <PublicKey>
        <JWKS ref="ory.jwks_response"/>
    </PublicKey>

    <!-- Validate standard claims -->
    <Issuer>https://{project-slug}.projects.oryapis.com</Issuer>

    <!-- Optionally validate audience -->
    <!-- <Audience>your-api-audience</Audience> -->

    <!-- Additional claims to extract -->
    <AdditionalClaims>
        <Claim name="sub" ref="ory.jwt.sub" type="string"/>
        <Claim name="email" ref="ory.jwt.email" type="string"/>
        <Claim name="scope" ref="ory.jwt.scope" type="string"/>
        <Claim name="client_id" ref="ory.jwt.client_id" type="string"/>
    </AdditionalClaims>

    <!-- Token expiration is validated automatically -->
</VerifyJWT>
```

#### 6. Set Upstream Headers (`AM-SetUpstreamHeaders.xml`)

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<AssignMessage name="AM-SetUpstreamHeaders">
    <DisplayName>Set Upstream Identity Headers</DisplayName>
    <AssignTo createNew="false" transport="http" type="request"/>
    <Set>
        <Headers>
            <Header name="X-User-Id">{ory.jwt.sub}</Header>
            <Header name="X-User-Email">{ory.jwt.email}</Header>
            <Header name="X-User-Scopes">{ory.jwt.scope}</Header>
            <Header name="X-Client-Id">{ory.jwt.client_id}</Header>
            <Header name="X-Auth-Method">jwt</Header>
        </Headers>
    </Set>
    <!-- Remove the original Authorization header from the upstream request -->
    <Remove>
        <Headers>
            <Header name="Authorization"/>
        </Headers>
    </Remove>
</AssignMessage>
```

#### 7. Unauthorized Response (`RF-Unauthorized.xml`)

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<RaiseFault name="RF-Unauthorized">
    <DisplayName>Raise 401 Unauthorized</DisplayName>
    <FaultResponse>
        <Set>
            <StatusCode>401</StatusCode>
            <ReasonPhrase>Unauthorized</ReasonPhrase>
            <Payload contentType="application/json">
{
  "error": "unauthorized",
  "message": "Invalid or missing authentication token."
}
            </Payload>
        </Set>
    </FaultResponse>
    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
</RaiseFault>
```

#### 8. Shared Flow Definition (`default.xml`)

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<SharedFlow name="default">
    <Step>
        <Name>EV-ExtractBearerToken</Name>
    </Step>
    <Step>
        <Name>LP-LookupCachedJWKS</Name>
    </Step>
    <Step>
        <Name>SC-FetchOryJWKS</Name>
    </Step>
    <Step>
        <Name>CP-CacheOryJWKS</Name>
    </Step>
    <Step>
        <Name>JWT-VerifyOryToken</Name>
    </Step>
    <Step>
        <Name>AM-SetUpstreamHeaders</Name>
    </Step>
</SharedFlow>
```

### Attaching the Shared Flow to an API Proxy

In your API proxy's PreFlow, add a FlowCallout to the shared flow:

```xml
<!-- apiproxy/proxies/default.xml -->
<ProxyEndpoint name="default">
    <PreFlow name="PreFlow">
        <Request>
            <Step>
                <Name>FC-OryJwtValidation</Name>
            </Step>
        </Request>
    </PreFlow>

    <Flows>
        <!-- Health check (no auth) -->
        <Flow name="HealthCheck">
            <Condition>(proxy.pathsuffix MatchesPath "/health") and (request.verb = "GET")</Condition>
            <Request/>
        </Flow>
    </Flows>

    <HTTPProxyConnection>
        <BasePath>/api</BasePath>
    </HTTPProxyConnection>

    <RouteRule name="default">
        <TargetEndpoint>default</TargetEndpoint>
    </RouteRule>
</ProxyEndpoint>
```

FlowCallout policy (`FC-OryJwtValidation.xml`):

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<FlowCallout name="FC-OryJwtValidation">
    <DisplayName>Ory JWT Validation</DisplayName>
    <SharedFlowBundle>ory-jwt-validation</SharedFlowBundle>
</FlowCallout>
```

### Fault Rules

Add fault handling to return 401 when JWT verification fails:

```xml
<!-- In the ProxyEndpoint -->
<FaultRules>
    <FaultRule name="JWTVerificationFailed">
        <Condition>
            (fault.name = "InvalidToken") or
            (fault.name = "TokenExpired") or
            (fault.name = "FailedToDecode") or
            (fault.name = "InvalidClaim")
        </Condition>
        <Step>
            <Name>RF-Unauthorized</Name>
        </Step>
    </FaultRule>
</FaultRules>
```

## Token Validation Details

### JWKS Endpoint

```
URL: https://{project-slug}.projects.oryapis.com/.well-known/jwks.json
```

The ServiceCallout fetches the JWKS and the PopulateCache policy caches it for 1 hour. On key rotation, the cache expires and the new keys are fetched automatically.

### Expected JWT Claims

| Claim | Apigee Variable | Description |
|---|---|---|
| `iss` | Validated by VerifyJWT | Must match Ory project URL |
| `sub` | `ory.jwt.sub` | Ory identity ID (UUID) |
| `aud` | Validated by VerifyJWT | API audience (optional) |
| `exp` | Auto-validated | Expiration timestamp |
| `email` | `ory.jwt.email` | User email (if in token) |
| `scope` | `ory.jwt.scope` | OAuth2 scopes |
| `client_id` | `ory.jwt.client_id` | OAuth2 client ID |

### Introspection Endpoint (Alternative)

For opaque tokens, use a ServiceCallout to Ory's introspection endpoint instead of VerifyJWT:

```
URL:    https://{project-slug}.projects.oryapis.com/admin/oauth2/introspect
Method: POST
Body:   token=<access_token>
Auth:   Ory API Key (Bearer)
```

## Header Forwarding

After successful JWT validation, the `AM-SetUpstreamHeaders` policy sets the following headers on the request forwarded to the target backend:

| Upstream Header | Source | Description |
|---|---|---|
| `X-User-Id` | `sub` claim | Ory identity ID |
| `X-User-Email` | `email` claim | User email |
| `X-User-Scopes` | `scope` claim | Granted OAuth2 scopes |
| `X-Client-Id` | `client_id` claim | OAuth2 client identifier |
| `X-Auth-Method` | Static `jwt` | Authentication method used |

The original `Authorization` header is stripped before forwarding.

## Testing

### 1. Deploy the Shared Flow and Proxy

```bash
# Using Apigee CLI (apigeecli)
apigeecli sharedflows create -n ory-jwt-validation -p ./sharedflows/ory-jwt-validation
apigeecli sharedflows deploy -n ory-jwt-validation -e eval -o $ORG

apigeecli apis create -n my-api -p ./apiproxy
apigeecli apis deploy -n my-api -e eval -o $ORG
```

### 2. Obtain a Token from Ory

```bash
ACCESS_TOKEN=$(curl -s -X POST \
  https://{project-slug}.projects.oryapis.com/oauth2/token \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "scope=openid" | jq -r '.access_token')
```

### 3. Call the API

```bash
APIGEE_HOST="your-org-eval.apigee.net"

# Authenticated (should return 200)
curl -i "https://$APIGEE_HOST/api/resource" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# No token (should return 401)
curl -i "https://$APIGEE_HOST/api/resource"

# Invalid token (should return 401)
curl -i "https://$APIGEE_HOST/api/resource" \
  -H "Authorization: Bearer invalid-token"

# Health check — no auth (should return 200)
curl -i "https://$APIGEE_HOST/api/health"
```

### 4. Verify in Apigee Debug/Trace

Use the Apigee Debug (Trace) tool in the Apigee console to inspect:

- The `ory.jwt_token` variable after extraction
- The JWKS cache hit/miss
- The extracted claim variables (`ory.jwt.sub`, `ory.jwt.email`, etc.)
- The upstream headers set by `AM-SetUpstreamHeaders`

### 5. Test JWKS Caching

```bash
# Verify the JWKS is cached
# In the Apigee Trace view, check whether SC-FetchOryJWKS is skipped
# (LP-LookupCachedJWKS returned a cached value)
```

## Resources

- [Apigee VerifyJWT Policy](https://cloud.google.com/apigee/docs/api-platform/reference/policies/verify-jwt-policy)
- [Apigee SharedFlows](https://cloud.google.com/apigee/docs/api-platform/fundamentals/shared-flows)
- [Apigee ServiceCallout Policy](https://cloud.google.com/apigee/docs/api-platform/reference/policies/service-callout-policy)
- [Apigee PopulateCache / LookupCache](https://cloud.google.com/apigee/docs/api-platform/reference/policies/populate-cache-policy)
- [Apigee ExtractVariables Policy](https://cloud.google.com/apigee/docs/api-platform/reference/policies/extract-variables-policy)
- [Ory Network OAuth2 & OIDC Documentation](https://www.ory.sh/docs/oauth2-oidc)
- [Ory JWKS Endpoint](https://www.ory.sh/docs/hydra/jwks)
