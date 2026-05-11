# Cloudflare Workers — Ory Session & JWT Validation at the Edge

Validate Ory Network session tokens and JWTs at Cloudflare's edge, before requests reach your origin server.

## Overview

This integration deploys a Cloudflare Worker that intercepts incoming requests, validates Ory session cookies or Bearer JWTs against your Ory Network project, and forwards authenticated requests to your origin with enriched headers. Unauthenticated requests are rejected at the edge with zero load on your backend.

| Feature | Details |
|---------|---------|
| Platform | Cloudflare Workers |
| Runtime | V8 isolates (JavaScript/TypeScript) |
| Validation modes | Session cookie, JWT (access token) |
| JWKS caching | Cloudflare Cache API (edge-cached) |
| Ory Platform | Ory Network (managed cloud) |

## Architecture

```
Client
  |
  | (request with ory_session cookie or Bearer token)
  v
Cloudflare Edge (Worker)
  |
  |-- 1. Extract session cookie or Authorization header
  |-- 2. Validate token:
  |     - Session cookie → call Ory /sessions/whoami
  |     - JWT → validate signature against JWKS (cached at edge)
  |-- 3. Reject 401 if invalid
  |-- 4. Forward to origin with X-User-Id, X-User-Email headers
  v
Origin Server
```

## Prerequisites

- Ory Network project with a custom domain or SDK URL
- Cloudflare account with Workers enabled
- Node.js >= 18 and npm
- Wrangler CLI (`npm install -g wrangler`)

## Project Setup

```bash
mkdir ory-edge-auth && cd ory-edge-auth
npm init -y
npm install wrangler --save-dev
npm install jose
```

## wrangler.toml

```toml
name = "ory-edge-auth"
main = "src/worker.js"
compatibility_date = "2024-12-01"

[vars]
ORY_SDK_URL = "https://your-project.projects.oryapis.com"
# Cookie name used by Ory (default: ory_session_*)
ORY_SESSION_COOKIE_PREFIX = "ory_session_"

# For JWT validation
ORY_JWKS_URL = "https://your-project.projects.oryapis.com/.well-known/jwks.json"
ORY_ISSUER = "https://your-project.projects.oryapis.com"

# Paths that do not require authentication (comma-separated)
PUBLIC_PATHS = "/health,/public,/.well-known"

# Where to redirect unauthenticated browser requests (empty = return 401 JSON)
LOGIN_REDIRECT_URL = ""

# JWKS cache TTL in seconds
JWKS_CACHE_TTL = "3600"
```

## Worker Script

```javascript
// src/worker.js
import { createRemoteJWKSet, jwtVerify } from "jose";

// ---------- JWKS Cache ----------

let cachedJWKS = null;
let jwksCachedAt = 0;

function getJWKS(env) {
  const ttl = parseInt(env.JWKS_CACHE_TTL || "3600", 10) * 1000;
  const now = Date.now();

  if (!cachedJWKS || now - jwksCachedAt > ttl) {
    cachedJWKS = createRemoteJWKSet(new URL(env.ORY_JWKS_URL));
    jwksCachedAt = now;
  }

  return cachedJWKS;
}

// ---------- Helpers ----------

function isPublicPath(pathname, env) {
  const publicPaths = (env.PUBLIC_PATHS || "").split(",").map((p) => p.trim());
  return publicPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function getSessionCookie(request, env) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const prefix = env.ORY_SESSION_COOKIE_PREFIX || "ory_session_";
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const sessionCookie = cookies.find((c) => c.startsWith(prefix));
  return sessionCookie || null;
}

function getBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return null;
}

function unauthorizedResponse(message, env, request) {
  // If LOGIN_REDIRECT_URL is set and request accepts HTML, redirect
  if (env.LOGIN_REDIRECT_URL && request.headers.get("Accept")?.includes("text/html")) {
    const returnTo = encodeURIComponent(request.url);
    return Response.redirect(
      `${env.LOGIN_REDIRECT_URL}?return_to=${returnTo}`,
      302
    );
  }

  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------- Session Cookie Validation ----------

async function validateSessionCookie(request, env) {
  const sessionCookie = getSessionCookie(request, env);
  if (!sessionCookie) return null;

  const response = await fetch(`${env.ORY_SDK_URL}/sessions/whoami`, {
    headers: {
      Cookie: sessionCookie,
      Accept: "application/json",
    },
  });

  if (!response.ok) return null;

  const session = await response.json();
  if (!session.active) return null;

  return {
    subject: session.identity.id,
    email: session.identity.traits?.email || "",
    session_id: session.id,
    metadata: session.identity.metadata_public || {},
  };
}

// ---------- JWT Validation ----------

async function validateJWT(token, env) {
  try {
    const jwks = getJWKS(env);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: env.ORY_ISSUER,
    });

    return {
      subject: payload.sub,
      email: payload.email || "",
      session_id: payload.sid || "",
      metadata: payload.ext || {},
    };
  } catch (err) {
    console.error("JWT validation failed:", err.message);
    return null;
  }
}

// ---------- Main Handler ----------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Allow public paths through without auth
    if (isPublicPath(url.pathname, env)) {
      return fetch(request);
    }

    // Try JWT first (API clients), then session cookie (browser clients)
    let identity = null;
    const bearerToken = getBearerToken(request);

    if (bearerToken) {
      identity = await validateJWT(bearerToken, env);
    } else {
      identity = await validateSessionCookie(request, env);
    }

    if (!identity) {
      return unauthorizedResponse("Authentication required", env, request);
    }

    // Clone request and add identity headers for the origin
    const modifiedHeaders = new Headers(request.headers);
    modifiedHeaders.set("X-User-Id", identity.subject);
    modifiedHeaders.set("X-User-Email", identity.email);
    modifiedHeaders.set("X-Session-Id", identity.session_id);
    modifiedHeaders.set(
      "X-User-Metadata",
      JSON.stringify(identity.metadata)
    );

    // Remove the original auth headers so the origin does not see raw tokens
    // (optional — remove these lines if your origin also needs the raw token)
    // modifiedHeaders.delete("Authorization");
    // modifiedHeaders.delete("Cookie");

    const modifiedRequest = new Request(request, {
      headers: modifiedHeaders,
    });

    return fetch(modifiedRequest);
  },
};
```

## Advanced: JWKS Caching with Cloudflare Cache API

For high-traffic deployments, cache the JWKS response in Cloudflare's edge cache to eliminate repeated fetches to Ory:

```javascript
// src/jwks-cache.js

/**
 * Fetch JWKS with Cloudflare Cache API.
 * The JWKS response is cached at the edge for the configured TTL.
 */
export async function fetchCachedJWKS(env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(env.ORY_JWKS_URL, { method: "GET" });

  // Check edge cache
  let response = await cache.match(cacheKey);
  if (response) {
    return response.json();
  }

  // Cache miss — fetch from Ory
  response = await fetch(env.ORY_JWKS_URL, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }

  // Clone and cache the response
  const ttl = parseInt(env.JWKS_CACHE_TTL || "3600", 10);
  const cachedResponse = new Response(response.body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${ttl}`,
    },
  });

  ctx.waitUntil(cache.put(cacheKey, cachedResponse.clone()));

  return cachedResponse.json();
}
```

## Deployment

```bash
# Authenticate with Cloudflare
wrangler login

# Set secrets (not stored in wrangler.toml)
wrangler secret put ORY_API_KEY

# Deploy to production
wrangler deploy

# Deploy to staging
wrangler deploy --env staging

# Tail logs
wrangler tail
```

## Testing

```bash
# Test with session cookie
curl -v https://your-worker.your-subdomain.workers.dev/api/me \
  -H "Cookie: ory_session_projectslug=<session-token>"

# Test with JWT
curl -v https://your-worker.your-subdomain.workers.dev/api/me \
  -H "Authorization: Bearer <jwt-access-token>"

# Test public path (should pass through)
curl -v https://your-worker.your-subdomain.workers.dev/health

# Test unauthenticated (should return 401)
curl -v https://your-worker.your-subdomain.workers.dev/api/me
```

Expected 401 response:
```json
{
  "error": "Authentication required"
}
```

Expected authenticated response headers forwarded to origin:
```
X-User-Id: 7a3b1c2d-...
X-User-Email: user@example.com
X-Session-Id: 9f8e7d6c-...
X-User-Metadata: {"plan":"pro"}
```

## Multi-Environment Configuration

```toml
# wrangler.toml

[env.staging]
name = "ory-edge-auth-staging"
vars = { ORY_SDK_URL = "https://staging-project.projects.oryapis.com", ORY_JWKS_URL = "https://staging-project.projects.oryapis.com/.well-known/jwks.json", ORY_ISSUER = "https://staging-project.projects.oryapis.com", PUBLIC_PATHS = "/health,/public", JWKS_CACHE_TTL = "300" }

[env.production]
name = "ory-edge-auth-production"
vars = { ORY_SDK_URL = "https://prod-project.projects.oryapis.com", ORY_JWKS_URL = "https://prod-project.projects.oryapis.com/.well-known/jwks.json", ORY_ISSUER = "https://prod-project.projects.oryapis.com", PUBLIC_PATHS = "/health", JWKS_CACHE_TTL = "3600" }
```

## Performance Considerations

| Concern | Mitigation |
|---------|-----------|
| JWKS fetch latency | Edge-cached via Cache API; refreshed every `JWKS_CACHE_TTL` seconds |
| `/sessions/whoami` latency | Ory Network has edge presence; consider JWT mode for lowest latency |
| Cold starts | V8 isolates start in <5ms; negligible |
| Worker CPU time | JWT validation uses <1ms CPU; session validation depends on Ory response time |

## Security Considerations

- Always use HTTPS for your Ory SDK URL
- Store the `ORY_API_KEY` as a Wrangler secret, not in `wrangler.toml`
- Strip forwarded identity headers from incoming requests to prevent spoofing (the Worker overwrites them)
- Consider IP-allowlisting or mTLS between the Worker and your origin
- Rotate JWKS cache on key rotation by reducing `JWKS_CACHE_TTL` or deploying a cache-busting update

## References

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Ory Session Validation](https://www.ory.sh/docs/kratos/session-management/overview)
- [Ory JWKS Endpoint](https://www.ory.sh/docs/hydra/jwks)
- [jose (JavaScript JOSE library)](https://github.com/panva/jose)
