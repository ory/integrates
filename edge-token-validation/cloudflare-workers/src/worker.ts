/**
 * Cloudflare Worker — Ory Edge Token Validation
 *
 * Validates Ory sessions or JWT access tokens at the Cloudflare edge.
 * On success, forwards the request to origin with identity headers.
 * On failure, returns 401 or redirects to login.
 *
 * Validation modes:
 *   1. JWT Bearer token: verified locally against Ory's JWKS. The Worker
 *      requires RS256, a known `kid`, the expected `iss` and `aud`, and a
 *      valid `exp` and `nbf`.
 *   2. Session cookie (`ory_session_*` or `ory_kratos_session`) or session
 *      token (`X-Session-Token` or a non-JWT Bearer token): checked with
 *      Ory's /sessions/whoami. Active sessions are cached per credential in
 *      isolate memory.
 */

export interface Env {
  ORY_SDK_URL: string;
  JWT_AUDIENCE?: string;
  JWT_ISSUER?: string;
  PUBLIC_PATHS?: string;
  LOGIN_REDIRECT_URL?: string;
}

interface OrySession {
  id: string;
  active: boolean;
  identity: {
    id: string;
    traits?: {
      email?: string;
      name?: { first?: string; last?: string };
    };
    metadata_public?: Record<string, unknown> | null;
  };
  authenticator_assurance_level?: string;
}

interface Identity {
  userId: string;
  sessionId?: string;
  email?: string;
  name?: string;
  aal?: string;
  metadata?: Record<string, unknown>;
}

interface JsonWebKeyWithKid extends JsonWebKey {
  kid?: string;
  use?: string;
}

const IDENTITY_HEADERS = [
  "X-User-Id",
  "X-User-Email",
  "X-User-Name",
  "X-Session-Id",
  "X-Auth-AAL",
  "X-User-Metadata",
];

const JWKS_TTL_MS = 60 * 60 * 1000;
const JWKS_MIN_REFRESH_INTERVAL_MS = 30 * 1000;
const SESSION_CACHE_TTL_MS = 30 * 1000;
const SESSION_CACHE_MAX_ENTRIES = 1000;

let jwks: { keys: Map<string, CryptoKey>; fetchedAt: number } | null = null;
const sessionCache = new Map<string, { identity: Identity; expiresAt: number }>();

class UpstreamError extends Error {}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (isPublicPath(url.pathname, env)) {
      return forward(request, null);
    }

    const authHeader = request.headers.get("Authorization") ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const sessionToken = request.headers.get("X-Session-Token") ?? "";
    const oryCookies = (request.headers.get("Cookie") ?? "")
      .split(";")
      .map((c) => c.trim())
      .filter((c) => c.startsWith("ory_session_") || c.startsWith("ory_kratos_session="))
      .join("; ");

    try {
      let identity: Identity | null = null;
      if (bearer && bearer.split(".").length === 3) {
        identity = await validateJwt(bearer, env);
      } else if (bearer || sessionToken) {
        identity = await validateSession(
          { "X-Session-Token": sessionToken || bearer },
          env,
        );
      } else if (oryCookies) {
        identity = await validateSession({ Cookie: oryCookies }, env);
      }

      if (!identity) {
        return unauthorized(request, env);
      }
      return forward(request, identity);
    } catch (err) {
      if (err instanceof UpstreamError) {
        return json({ error: "Authentication service unavailable" }, 503);
      }
      return unauthorized(request, env);
    }
  },
};

function isPublicPath(pathname: string, env: Env): boolean {
  return (env.PUBLIC_PATHS ?? "/health")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .some((p) => pathname === p || pathname.startsWith(p + "/"));
}

async function validateSession(
  credential: Record<string, string>,
  env: Env,
): Promise<Identity | null> {
  const cacheKey = await sha256Hex(JSON.stringify(credential));
  const cached = sessionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.identity;
  }
  sessionCache.delete(cacheKey);

  let res: Response;
  try {
    res = await fetch(`${trimSlash(env.ORY_SDK_URL)}/sessions/whoami`, {
      headers: { ...credential, Accept: "application/json" },
    });
  } catch {
    throw new UpstreamError();
  }

  if (res.status === 401 || res.status === 403) {
    return null;
  }
  if (!res.ok) {
    throw new UpstreamError();
  }

  const session = (await res.json()) as OrySession;
  if (!session.active || !session.identity?.id) {
    return null;
  }

  const traits = session.identity.traits ?? {};
  const identity: Identity = {
    userId: session.identity.id,
    sessionId: session.id,
    email: traits.email,
    name: [traits.name?.first, traits.name?.last].filter(Boolean).join(" ") || undefined,
    aal: session.authenticator_assurance_level,
    metadata: session.identity.metadata_public ?? undefined,
  };

  if (sessionCache.size >= SESSION_CACHE_MAX_ENTRIES) {
    const oldest = sessionCache.keys().next().value;
    if (oldest !== undefined) sessionCache.delete(oldest);
  }
  sessionCache.set(cacheKey, { identity, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
  return identity;
}

async function validateJwt(token: string, env: Env): Promise<Identity | null> {
  if (!env.JWT_AUDIENCE) {
    return null;
  }

  const [headerPart, payloadPart, signaturePart] = token.split(".") as [string, string, string];
  const header = JSON.parse(base64UrlDecodeString(headerPart)) as { alg?: unknown; kid?: unknown };
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    return null;
  }

  const key = await getPublicKey(header.kid, env);
  if (!key) {
    return null;
  }

  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    base64UrlDecode(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) {
    return null;
  }

  const claims = JSON.parse(base64UrlDecodeString(payloadPart)) as Record<string, unknown>;
  const now = Math.floor(Date.now() / 1000);
  const issuer = trimSlash(env.JWT_ISSUER || env.ORY_SDK_URL);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];

  if (claims.iss !== issuer) return null;
  if (!audiences.includes(env.JWT_AUDIENCE)) return null;
  if (typeof claims.exp !== "number" || claims.exp <= now) return null;
  if (claims.nbf !== undefined && (typeof claims.nbf !== "number" || claims.nbf > now)) return null;
  if (typeof claims.sub !== "string" || !claims.sub) return null;

  const ext = claims.ext && typeof claims.ext === "object" ? (claims.ext as Record<string, unknown>) : undefined;
  return {
    userId: claims.sub,
    sessionId: typeof claims.jti === "string" ? claims.jti : undefined,
    email: typeof ext?.email === "string" ? ext.email : undefined,
    metadata: ext,
  };
}

async function getPublicKey(kid: string, env: Env): Promise<CryptoKey | null> {
  const now = Date.now();
  const fresh = jwks !== null && now - jwks.fetchedAt < JWKS_TTL_MS;
  if (fresh && jwks!.keys.has(kid)) {
    return jwks!.keys.get(kid)!;
  }
  // An unknown kid triggers a refetch so rotated keys are picked up, but at most
  // once per interval so unknown kids can't force a JWKS fetch on every request.
  if (fresh && now - jwks!.fetchedAt < JWKS_MIN_REFRESH_INTERVAL_MS) {
    return null;
  }

  let res: Response;
  try {
    res = await fetch(`${trimSlash(env.ORY_SDK_URL)}/.well-known/jwks.json`, {
      cf: { cacheTtl: 300, cacheEverything: true },
    });
  } catch {
    throw new UpstreamError();
  }
  if (!res.ok) {
    throw new UpstreamError();
  }

  const body = (await res.json()) as { keys?: JsonWebKeyWithKid[] };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (jwk.kty !== "RSA" || !jwk.kid || (jwk.use && jwk.use !== "sig")) continue;
    if (jwk.alg && jwk.alg !== "RS256") continue;
    keys.set(
      jwk.kid,
      await crypto.subtle.importKey(
        "jwk",
        { kty: jwk.kty, n: jwk.n, e: jwk.e },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      ),
    );
  }
  jwks = { keys, fetchedAt: now };
  return keys.get(kid) ?? null;
}

function forward(request: Request, identity: Identity | null): Promise<Response> {
  const headers = new Headers(request.headers);
  for (const name of IDENTITY_HEADERS) {
    headers.delete(name);
  }

  if (identity) {
    headers.set("X-User-Id", identity.userId);
    setIfHeaderSafe(headers, "X-Session-Id", identity.sessionId);
    setIfHeaderSafe(headers, "X-User-Email", identity.email);
    setIfHeaderSafe(headers, "X-User-Name", identity.name);
    setIfHeaderSafe(headers, "X-Auth-AAL", identity.aal);
    if (identity.metadata && Object.keys(identity.metadata).length > 0) {
      headers.set("X-User-Metadata", asciiJson(identity.metadata));
    }
  }

  return fetch(new Request(request, { headers }));
}

function setIfHeaderSafe(headers: Headers, name: string, value: string | undefined): void {
  if (value && /^[\x20-\x7e]*$/.test(value)) {
    headers.set(name, value);
  }
}

function asciiJson(value: Record<string, unknown>): string {
  return JSON.stringify(value).replace(
    /[\u007f-￿]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

function unauthorized(request: Request, env: Env): Response {
  if (env.LOGIN_REDIRECT_URL && request.headers.get("Accept")?.includes("text/html")) {
    const target = new URL(env.LOGIN_REDIRECT_URL);
    target.searchParams.set("return_to", request.url);
    return Response.redirect(target.toString(), 302);
  }
  return json({ error: "Unauthorized" }, 401);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64UrlDecodeString(str: string): string {
  return new TextDecoder().decode(base64UrlDecode(str));
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
