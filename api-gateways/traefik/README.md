# Traefik Proxy + Ory Network Integration

## Overview

[Traefik](https://traefik.io/) is a modern, cloud-native reverse proxy and load balancer that integrates natively with container orchestrators (Docker, Kubernetes, etc.). This integration uses Traefik's **ForwardAuth middleware** to delegate authentication decisions to Ory Network's session and token validation endpoints.

## Integration Architecture

Traefik's ForwardAuth middleware intercepts every inbound request and forwards it to an authentication service before routing to the upstream. Ory Network's `/sessions/whoami` endpoint acts as that authentication service.

```
Client ──► Traefik ──► Upstream Service
              │
              └── ForwardAuth ──► Ory Network
                                  GET /sessions/whoami
                                  (Cookie or X-Session-Token forwarded)

                                  200 OK → Traefik routes to upstream
                                           (identity headers added)
                                  401     → Traefik returns 401 to client
```

**Two primary patterns:**

| Pattern | Mechanism | Best For |
|---|---|---|
| Session-based ForwardAuth | Forwards `ory_session_*` cookie to `/sessions/whoami` | Browser apps, SSR |
| JWT-based ForwardAuth | Forwards `Authorization: Bearer` header to Ory or a local validation sidecar | APIs, SPAs, mobile |

For JWT validation without a network round-trip, you can run the [Ory Oathkeeper](https://www.ory.sh/docs/oathkeeper) sidecar or a lightweight JWT-validation service as the ForwardAuth target.

## Configuration

### Prerequisites

- Traefik v2.x or v3.x
- An Ory Network project with Ory Sessions or OAuth2/OIDC enabled
- Your Ory project slug (e.g., `my-project`)

### ForwardAuth Middleware — Session Validation

The core integration uses Traefik's `forwardAuth` middleware to check every request against Ory's `/sessions/whoami` endpoint.

#### Key Configuration Parameters

| Parameter | Value | Purpose |
|---|---|---|
| `address` | `https://{project-slug}.projects.oryapis.com/sessions/whoami` | Ory session check endpoint |
| `authResponseHeaders` | `X-Kratos-Authenticated-Identity-Id`, etc. | Headers to copy from Ory's response to the upstream request |
| `trustForwardHeader` | `true` | Forward `X-Forwarded-*` headers |

### Traefik Dynamic Configuration (YAML)

```yaml
# dynamic-config.yml

http:
  middlewares:
    ory-session-check:
      forwardAuth:
        address: "https://{project-slug}.projects.oryapis.com/sessions/whoami"
        trustForwardHeader: true
        authResponseHeaders:
          - "X-Kratos-Authenticated-Identity-Id"
          - "X-Session-Token"
          - "Set-Cookie"
        # Forward the session cookie to Ory
        authRequestHeaders:
          - "Cookie"
          - "Authorization"
          - "X-Session-Token"

    # Optional: redirect unauthenticated users to login
    ory-auth-redirect:
      errors:
        status:
          - "401"
        service: ory-login-redirect
        query: "/{status}"

  routers:
    my-api:
      rule: "PathPrefix(`/api`)"
      service: my-api-service
      middlewares:
        - ory-session-check
      entryPoints:
        - websecure
      tls: {}

    # Public routes (no auth)
    health:
      rule: "Path(`/health`)"
      service: my-api-service
      entryPoints:
        - websecure
      tls: {}

  services:
    my-api-service:
      loadBalancer:
        servers:
          - url: "http://upstream-service:8080"
```

### Traefik Static Configuration

```yaml
# traefik.yml

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

providers:
  file:
    filename: /etc/traefik/dynamic-config.yml
    watch: true

api:
  dashboard: true

log:
  level: INFO

accessLog: {}
```

## Token Validation Details

### Session Check Endpoint

```
URL:    https://{project-slug}.projects.oryapis.com/sessions/whoami
Method: GET
```

**Authentication methods (one of):**

| Method | Header / Cookie |
|---|---|
| Session cookie | `Cookie: ory_session_{project-slug}=<session-token>` |
| Session token header | `X-Session-Token: <session-token>` |
| Bearer token | `Authorization: Bearer <ory-session-token>` |

**Successful response (200):**

```json
{
  "id": "session-uuid",
  "active": true,
  "identity": {
    "id": "identity-uuid",
    "traits": {
      "email": "user@example.com",
      "name": { "first": "Jane", "last": "Doe" }
    }
  },
  "authenticator_assurance_level": "aal1",
  "authenticated_at": "2026-01-15T10:30:00Z"
}
```

**Failed response (401):**

```json
{
  "error": {
    "code": 401,
    "status": "Unauthorized",
    "message": "No active session was found in this request."
  }
}
```

### JWKS Endpoint (for JWT-based validation)

```
URL: https://{project-slug}.projects.oryapis.com/.well-known/jwks.json
```

### Introspection Endpoint (for opaque tokens)

```
URL:    https://{project-slug}.projects.oryapis.com/admin/oauth2/introspect
Method: POST
Body:   token=<access_token>
Auth:   Ory API Key
```

## Header Forwarding

When Ory's `/sessions/whoami` returns `200 OK`, Traefik's ForwardAuth copies specified response headers into the upstream request.

### Headers Returned by Ory

| Ory Response Header | Value | Description |
|---|---|---|
| Body field `identity.id` | UUID | Ory identity ID |
| Body field `identity.traits.email` | string | User email |
| Body field `authenticator_assurance_level` | `aal1` / `aal2` | MFA level |

Since Ory returns identity data in the JSON body rather than headers, you have two options:

#### Option A: Use an Intermediate Auth Service

Deploy a lightweight auth service between Traefik and Ory that calls `/sessions/whoami`, parses the response, and returns identity data as headers.

```python
# auth-service.py (Flask example)
from flask import Flask, request, Response
import requests

app = Flask(__name__)
ORY_URL = "https://{project-slug}.projects.oryapis.com"

@app.route("/auth")
def auth():
    headers = {}
    for h in ["Cookie", "Authorization", "X-Session-Token"]:
        if h in request.headers:
            headers[h] = request.headers[h]

    resp = requests.get(f"{ORY_URL}/sessions/whoami", headers=headers)

    if resp.status_code != 200:
        return Response(status=401)

    session = resp.json()
    identity = session.get("identity", {})
    traits = identity.get("traits", {})

    return Response(status=200, headers={
        "X-User-Id": identity.get("id", ""),
        "X-User-Email": traits.get("email", ""),
        "X-Auth-Level": session.get("authenticator_assurance_level", ""),
        "X-Session-Id": session.get("id", ""),
    })
```

Then point Traefik's ForwardAuth at this service:

```yaml
middlewares:
  ory-session-check:
    forwardAuth:
      address: "http://auth-service:5000/auth"
      authResponseHeaders:
        - "X-User-Id"
        - "X-User-Email"
        - "X-Auth-Level"
        - "X-Session-Id"
      authRequestHeaders:
        - "Cookie"
        - "Authorization"
        - "X-Session-Token"
```

#### Option B: Use Ory Oathkeeper as the ForwardAuth Target

Ory Oathkeeper natively parses session data and injects identity headers:

```yaml
middlewares:
  ory-oathkeeper:
    forwardAuth:
      address: "http://oathkeeper:4456/decisions"
      authResponseHeaders:
        - "X-User-Id"
        - "X-User-Email"
      authRequestHeaders:
        - "Cookie"
        - "Authorization"
```

## Example Configuration — Docker Compose

```yaml
# docker-compose.yml
version: "3.8"

services:
  traefik:
    image: traefik:v3.0
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"  # Dashboard
    volumes:
      - ./traefik.yml:/etc/traefik/traefik.yml:ro
      - ./dynamic-config.yml:/etc/traefik/dynamic-config.yml:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    labels:
      - "traefik.enable=true"

  auth-service:
    build: ./auth-service
    environment:
      ORY_PROJECT_URL: "https://{project-slug}.projects.oryapis.com"
    labels:
      - "traefik.enable=true"
      - "traefik.http.services.auth-service.loadbalancer.server.port=5000"

  my-api:
    image: my-api:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.my-api.rule=PathPrefix(`/api`)"
      - "traefik.http.routers.my-api.middlewares=ory-session-check"
      - "traefik.http.routers.my-api.entrypoints=websecure"
      - "traefik.http.routers.my-api.tls=true"
      - "traefik.http.services.my-api.loadbalancer.server.port=8080"
```

### Kubernetes IngressRoute (Traefik CRD)

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: ory-session-check
spec:
  forwardAuth:
    address: "https://{project-slug}.projects.oryapis.com/sessions/whoami"
    authResponseHeaders:
      - "X-Kratos-Authenticated-Identity-Id"
    authRequestHeaders:
      - "Cookie"
      - "Authorization"
      - "X-Session-Token"
---
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: my-api
spec:
  entryPoints:
    - websecure
  routes:
    - match: PathPrefix(`/api`)
      kind: Rule
      middlewares:
        - name: ory-session-check
      services:
        - name: my-api-service
          port: 8080
  tls: {}
```

## Testing

### 1. Obtain an Ory Session

```bash
# Log in via Ory and capture the session cookie
SESSION_TOKEN=$(curl -s -X POST \
  https://{project-slug}.projects.oryapis.com/self-service/login?flow=... \
  -H "Content-Type: application/json" \
  -d '{"method":"password","identifier":"user@example.com","password":"..."}' \
  | jq -r '.session_token')

echo $SESSION_TOKEN
```

### 2. Call Your API Through Traefik

```bash
# Session token header (should succeed — 200)
curl -i https://your-domain.com/api/resource \
  -H "X-Session-Token: $SESSION_TOKEN"

# No token (should fail — 401)
curl -i https://your-domain.com/api/resource

# Invalid token (should fail — 401)
curl -i https://your-domain.com/api/resource \
  -H "X-Session-Token: invalid-token"
```

### 3. Verify Upstream Headers

```bash
curl -i https://your-domain.com/api/debug/headers \
  -H "X-Session-Token: $SESSION_TOKEN"

# Expected upstream headers (when using an auth service):
# X-User-Id: <ory-identity-uuid>
# X-User-Email: user@example.com
# X-Auth-Level: aal1
```

### 4. Test Public Routes

```bash
# Health endpoint should work without authentication
curl -i https://your-domain.com/health
```

## Resources

- [Traefik ForwardAuth Middleware](https://doc.traefik.io/traefik/middlewares/http/forwardauth/)
- [Traefik Dynamic Configuration](https://doc.traefik.io/traefik/providers/file/)
- [Traefik Kubernetes IngressRoute](https://doc.traefik.io/traefik/routing/providers/kubernetes-crd/)
- [Ory Network Session Management](https://www.ory.sh/docs/kratos/session-management)
- [Ory `/sessions/whoami` API Reference](https://www.ory.sh/docs/reference/api#tag/frontend/operation/toSession)
- [Ory Oathkeeper](https://www.ory.sh/docs/oathkeeper) (alternative ForwardAuth target)
- [Ory + Traefik Community Guide](https://www.ory.sh/docs/getting-started/integrate-auth/go#api-gateway)
