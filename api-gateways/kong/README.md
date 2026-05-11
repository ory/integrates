# Kong API Gateway + Ory Network Integration

## Overview

[Kong Gateway](https://konghq.com/) is a cloud-native, platform-agnostic API gateway that provides traffic management, authentication, rate limiting, and observability for APIs and microservices. This integration configures Kong to validate Ory-issued tokens and sessions, enabling centralized identity enforcement at the gateway layer.

## Integration Architecture

Kong sits in front of your upstream services and intercepts every inbound request. It validates the caller's identity by checking Ory-issued JWTs or session tokens before the request reaches the upstream service.

```
Client ──► Kong Gateway ──► Upstream Service
               │
               ├── JWT Validation (JWKS)
               │     └── GET https://{project-slug}.projects.oryapis.com/.well-known/jwks.json
               │
               ├── Token Introspection (OAuth2)
               │     └── POST https://{project-slug}.projects.oryapis.com/admin/oauth2/introspect
               │
               └── Session Cookie Forwarding
                     └── GET https://{project-slug}.projects.oryapis.com/sessions/whoami
```

**Supported validation strategies:**

| Strategy | Plugin | When to Use |
|---|---|---|
| JWT (JWKS) | `jwt` or `openid-connect` | Ory OAuth2/OIDC access tokens (stateless) |
| Token Introspection | `openid-connect` | Opaque access tokens, need real-time revocation checks |
| Session Cookie | `openid-connect` or custom | Browser-based flows using Ory Session cookies |

## Configuration

### Prerequisites

- Kong Gateway 3.x (OSS or Enterprise)
- An Ory Network project with OAuth2/OIDC or Ory Sessions enabled
- Your Ory project slug (e.g., `my-project`)

### Strategy 1: JWT Validation via JWKS (Recommended for API clients)

Kong's built-in `jwt` plugin can validate Ory-issued JWTs using the JWKS endpoint.

#### Step 1 — Register the JWT consumer and key

```bash
# Create a consumer representing Ory-authenticated users
curl -X POST http://localhost:8001/consumers \
  --data "username=ory-authenticated"

# Register Ory's JWKS as the key source
curl -X POST http://localhost:8001/consumers/ory-authenticated/jwt \
  --data "algorithm=RS256" \
  --data "key=https://{project-slug}.projects.oryapis.com" \
  --data "rsa_public_key=$(curl -s https://{project-slug}.projects.oryapis.com/.well-known/jwks.json)"
```

#### Step 2 — Enable the JWT plugin on a service or route

```bash
curl -X POST http://localhost:8001/services/{service-name}/plugins \
  --data "name=jwt" \
  --data "config.claims_to_verify=exp"
```

### Strategy 2: OpenID Connect Plugin (Enterprise — Recommended)

Kong's `openid-connect` plugin provides the most comprehensive integration with Ory's OIDC provider.

```bash
curl -X POST http://localhost:8001/services/{service-name}/plugins \
  --data "name=openid-connect" \
  --data "config.issuer=https://{project-slug}.projects.oryapis.com" \
  --data "config.auth_methods=bearer" \
  --data "config.bearer_token_param_type=header" \
  --data "config.cache_introspection=true" \
  --data "config.cache_ttl=300"
```

### Strategy 3: Session Cookie Forwarding

For browser-based applications using Ory Session cookies, use the `openid-connect` plugin in session mode or a custom plugin that forwards the cookie to Ory's `/sessions/whoami` endpoint.

```bash
curl -X POST http://localhost:8001/services/{service-name}/plugins \
  --data "name=openid-connect" \
  --data "config.issuer=https://{project-slug}.projects.oryapis.com" \
  --data "config.auth_methods=session" \
  --data "config.session_cookie_name=ory_session_{project-slug}"
```

## Token Validation Details

### JWKS Endpoint

```
URL:  https://{project-slug}.projects.oryapis.com/.well-known/jwks.json
```

Kong fetches the public keys from this endpoint and caches them. When a key is rotated, Kong automatically retrieves the new key set.

### Token Introspection Endpoint

```
URL:    https://{project-slug}.projects.oryapis.com/admin/oauth2/introspect
Method: POST
Body:   token=<access_token>&token_type_hint=access_token
Auth:   Ory API Key (Bearer token)
```

### Expected JWT Claims

| Claim | Description |
|---|---|
| `iss` | `https://{project-slug}.projects.oryapis.com` |
| `sub` | Ory identity ID (UUID) |
| `aud` | Audience — your API identifier |
| `exp` | Expiration timestamp |
| `iat` | Issued-at timestamp |
| `scope` | OAuth2 scopes granted |
| `client_id` | OAuth2 client ID (for client-credentials flows) |

### Session Check Endpoint

```
URL:    https://{project-slug}.projects.oryapis.com/sessions/whoami
Method: GET
Cookie: ory_session_{project-slug}=<session-token>
  -or-
Header: X-Session-Token: <session-token>
```

## Header Forwarding

After successful validation, Kong adds upstream headers so that backend services know who the caller is without re-validating the token.

### With the `openid-connect` Plugin

The plugin automatically forwards these headers:

| Upstream Header | Source |
|---|---|
| `X-Userinfo` | Base64-encoded ID token claims |
| `X-Consumer-Username` | Consumer username |
| `X-Credential-Identifier` | Client ID or subject |

### With the `jwt` Plugin

Use the `post-function` plugin or a custom plugin to map claims into headers:

```lua
-- Custom header-forwarding plugin (handler.lua)
local jwt_decoder = require "kong.plugins.jwt.jwt_parser"

function _M:access(conf)
  local token = kong.request.get_header("Authorization"):sub(8)
  local jwt = jwt_decoder:new(token)
  kong.service.request.set_header("X-User-Id", jwt.claims.sub)
  kong.service.request.set_header("X-User-Email", jwt.claims.email or "")
  kong.service.request.set_header("X-User-Scopes", jwt.claims.scope or "")
end
```

### Recommended Upstream Headers

Configure Kong to forward the following to upstream services:

```
X-User-Id:      <sub claim — Ory identity ID>
X-User-Email:   <email claim, if present>
X-User-Scopes:  <scope claim>
X-Auth-Method:  <jwt | introspection | session>
```

## Example Configuration — Declarative (`kong.yml`)

```yaml
# kong.yml — Declarative configuration for Kong + Ory Network
_format_version: "3.0"
_transform: true

services:
  - name: my-api
    url: http://upstream-service:8080
    routes:
      - name: my-api-route
        paths:
          - /api
        strip_path: true

    plugins:
      # --- Option A: JWT validation via JWKS ---
      - name: jwt
        config:
          claims_to_verify:
            - exp
          key_claim_name: iss
          run_on_preflight: false

      # --- Option B: OpenID Connect (Enterprise) ---
      # - name: openid-connect
      #   config:
      #     issuer: https://{project-slug}.projects.oryapis.com
      #     auth_methods:
      #       - bearer
      #     bearer_token_param_type:
      #       - header
      #     scopes_required:
      #       - openid
      #     cache_introspection: true
      #     cache_ttl: 300
      #     consumer_optional: false

      # Forward identity claims as upstream headers
      - name: post-function
        config:
          access:
            - |
              local auth = kong.request.get_header("Authorization")
              if auth and auth:sub(1, 7) == "Bearer " then
                local token = auth:sub(8)
                local parts = {}
                for part in token:gmatch("[^%.]+") do
                  table.insert(parts, part)
                end
                if #parts == 3 then
                  local payload = ngx.decode_base64(parts[2])
                  if payload then
                    local cjson = require "cjson"
                    local claims = cjson.decode(payload)
                    kong.service.request.set_header("X-User-Id", claims.sub or "")
                  end
                end
              end

consumers:
  - username: ory-authenticated
    jwt_secrets:
      - algorithm: RS256
        key: https://{project-slug}.projects.oryapis.com

# Health-check route (no auth)
  - name: health
    url: http://upstream-service:8080/health
    routes:
      - name: health-route
        paths:
          - /health
        strip_path: false
```

## Testing

### 1. Obtain a Token from Ory

```bash
# OAuth2 client-credentials flow
ACCESS_TOKEN=$(curl -s -X POST \
  https://{project-slug}.projects.oryapis.com/oauth2/token \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "scope=openid" | jq -r '.access_token')

echo $ACCESS_TOKEN
```

### 2. Call Your API Through Kong

```bash
# Should succeed (200)
curl -i http://localhost:8000/api/resource \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Should fail (401 — no token)
curl -i http://localhost:8000/api/resource

# Should fail (401 — expired / invalid token)
curl -i http://localhost:8000/api/resource \
  -H "Authorization: Bearer invalid-token"
```

### 3. Verify Upstream Headers

Add a debug endpoint to your upstream that echoes received headers:

```bash
curl -i http://localhost:8000/api/debug/headers \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Expected upstream headers:
# X-User-Id: <ory-identity-uuid>
# X-Consumer-Username: ory-authenticated
```

### 4. Validate Key Rotation

Ory rotates JWKS keys periodically. Verify that Kong picks up the new key set:

```bash
# Check Kong's cached JWKS
curl http://localhost:8001/consumers/ory-authenticated/jwt
```

## Resources

- [Kong Gateway Documentation](https://docs.konghq.com/)
- [Kong JWT Plugin](https://docs.konghq.com/hub/kong-inc/jwt/)
- [Kong OpenID Connect Plugin](https://docs.konghq.com/hub/kong-inc/openid-connect/) (Enterprise)
- [Ory Network OAuth2 & OIDC Documentation](https://www.ory.sh/docs/oauth2-oidc)
- [Ory JWKS Endpoint](https://www.ory.sh/docs/hydra/jwks)
- [Ory Session Management](https://www.ory.sh/docs/kratos/session-management)
- [Kong Declarative Configuration](https://docs.konghq.com/gateway/latest/production/deployment-topologies/db-less-and-declarative-config/)
