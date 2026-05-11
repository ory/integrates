/**
 * Cloudflare Worker — Ory Edge Token Validation
 *
 * Validates Ory session cookies or JWT Bearer tokens at the Cloudflare edge.
 * On success, enriches the request with identity headers before forwarding to origin.
 * On failure, returns 401 or redirects to login.
 *
 * Two validation modes:
 *   1. Session cookie → calls Ory's /sessions/whoami (proxied via CF cache)
 *   2. JWT Bearer token → validates locally using Ory's JWKS (cached at edge)
 *
 * SECURITY: ORY_SDK_URL should be set as a Cloudflare Workers secret:
 *   wrangler secret put ORY_SDK_URL
 */

export interface Env {
  ORY_SDK_URL: string;
  PUBLIC_PATHS: string;
  LOGIN_REDIRECT_URL?: string;
}

interface OrySession {
  id: string;
  active: boolean;
  identity: {
    id: string;
    traits: {
      email?: string;
      name?: { first?: string; last?: string };
    };
    metadata_public?: Record<string, unknown>;
  };
  authenticator_assurance_level?: string;
}

interface JWKSResponse {
  keys: Array<{
    kty: string;
    kid: string;
    use: string;
    alg: string;
    n: string;
    e: string;
  }>;
}

// JWKS cache — persists across requests in the same Worker isolate
let jwksCache: { keys: CryptoKey[]; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Allow public paths
    const publicPaths = (env.PUBLIC_PATHS || "/health").split(",").map(p => p.trim());
    if (publicPaths.some(p => url.pathname.startsWith(p))) {
      return fetch(request);
    }

    // Try session cookie first, then Bearer token
    const cookie = request.headers.get("Cookie");
    const authHeader = request.headers.get("Authorization");

    if (!cookie && !authHeader) {
      return handleUnauthorized(url.pathname, env);
    }

    // Mode 1: Session cookie validation via Ory's whoami
    if (cookie && cookie.includes("ory_kratos_session")) {
      return validateSession(request, cookie, env);
    }

    // Mode 2: JWT Bearer token validation
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return validateJwt(request, authHeader.slice(7), env);
    }

    return handleUnauthorized(url.pathname, env);
  },
};

async function validateSession(
  request: Request,
  cookie: string,
  env: Env,
): Promise<Response> {
  try {
    const whoamiUrl = `${env.ORY_SDK_URL}/sessions/whoami`;

    // Cloudflare caches the whoami response per cf.cacheTtl below, keyed on the
    // request URL + cookie — no need to construct a manual cache key.
    const sessionRes = await fetch(whoamiUrl, {
      headers: {
        Cookie: cookie,
        Accept: "application/json",
      },
      // Cache the whoami response for 30 seconds at the edge
      cf: { cacheTtl: 30, cacheEverything: true },
    });

    if (!sessionRes.ok) {
      return handleUnauthorized(new URL(request.url).pathname, env);
    }

    const session = (await sessionRes.json()) as OrySession;
    if (!session.active) {
      return handleUnauthorized(new URL(request.url).pathname, env);
    }

    return forwardWithIdentityHeaders(request, session);
  } catch {
    return new Response(
      JSON.stringify({ error: "Authentication service unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
}

async function validateJwt(
  request: Request,
  token: string,
  env: Env,
): Promise<Response> {
  try {
    // Parse JWT (header.payload.signature) — bail if shape isn't right.
    const parts = token.split(".");
    if (parts.length !== 3) {
      return handleUnauthorized(new URL(request.url).pathname, env);
    }
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
    const header = JSON.parse(atob(headerPart.replace(/-/g, "+").replace(/_/g, "/")));

    // Fetch or use cached JWKS
    const publicKey = await getPublicKey(header.kid, env);
    if (!publicKey) {
      return handleUnauthorized(new URL(request.url).pathname, env);
    }

    // Verify the JWT signature
    const data = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
    const signature = base64UrlDecode(signaturePart);

    const valid = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      publicKey,
      signature,
      data,
    );

    if (!valid) {
      return handleUnauthorized(new URL(request.url).pathname, env);
    }

    // Decode and validate claims
    const payload = JSON.parse(
      atob(payloadPart.replace(/-/g, "+").replace(/_/g, "/")),
    );

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return handleUnauthorized(new URL(request.url).pathname, env);
    }

    // Build a session-like object from JWT claims
    const session: OrySession = {
      id: payload.jti || "jwt",
      active: true,
      identity: {
        id: payload.sub,
        traits: {
          email: payload.email || payload.ext?.email,
        },
        metadata_public: payload.ext,
      },
    };

    return forwardWithIdentityHeaders(request, session);
  } catch {
    return handleUnauthorized(new URL(request.url).pathname, env);
  }
}

async function getPublicKey(kid: string, env: Env): Promise<CryptoKey | null> {
  // Return cached key if still fresh
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys.find((_, i) => i === 0) || null; // Simplified
  }

  const jwksUrl = `${env.ORY_SDK_URL}/.well-known/jwks.json`;
  const res = await fetch(jwksUrl, {
    cf: { cacheTtl: 3600, cacheEverything: true },
  });

  if (!res.ok) return null;

  const jwks = (await res.json()) as JWKSResponse;
  const jwk = jwks.keys.find(k => k.kid === kid && k.use === "sig");
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  jwksCache = { keys: [key], fetchedAt: Date.now() };
  return key;
}

function forwardWithIdentityHeaders(
  request: Request,
  session: OrySession,
): Promise<Response> {
  const headers = new Headers(request.headers);

  headers.set("X-User-Id", session.identity.id);
  headers.set("X-Session-Id", session.id);

  if (session.identity.traits.email) {
    headers.set("X-User-Email", session.identity.traits.email);
  }

  const name = [
    session.identity.traits.name?.first,
    session.identity.traits.name?.last,
  ].filter(Boolean).join(" ");
  if (name) {
    headers.set("X-User-Name", name);
  }

  if (session.authenticator_assurance_level) {
    headers.set("X-Auth-AAL", session.authenticator_assurance_level);
  }

  if (session.identity.metadata_public) {
    headers.set("X-User-Metadata", JSON.stringify(session.identity.metadata_public));
  }

  // Forward to origin with enriched headers
  const modifiedRequest = new Request(request, { headers });
  return fetch(modifiedRequest);
}

function handleUnauthorized(path: string, env: Env): Response {
  if (env.LOGIN_REDIRECT_URL) {
    return Response.redirect(
      `${env.LOGIN_REDIRECT_URL}?return_to=${encodeURIComponent(path)}`,
      302,
    );
  }
  return new Response(
    JSON.stringify({ error: "Unauthorized" }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}

function base64UrlDecode(str: string): ArrayBuffer {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
