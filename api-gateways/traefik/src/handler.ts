/**
 * Ory Session Validation Service for Traefik ForwardAuth
 *
 * Traefik's ForwardAuth middleware forwards every incoming request to this
 * service. This service calls Ory's /sessions/whoami endpoint to validate
 * the session cookie, then returns:
 *   - 200 with identity headers → Traefik forwards the request to the upstream
 *   - 401 → Traefik returns 401 to the client (or redirects to login)
 *
 * The identity data is passed to upstream services via HTTP headers:
 *   X-User-Id:     Ory identity ID
 *   X-User-Email:  User email from traits
 *   X-User-Name:   Full name from traits
 *   X-Session-Id:  Ory session ID
 *   X-Auth-AAL:    Authenticator Assurance Level (aal1, aal2)
 *
 * Environment variables:
 *   ORY_SDK_URL       — Ory Network project URL (e.g., https://your-project.projects.oryapis.com)
 *   ALLOWED_PATHS     — Comma-separated paths that skip auth (e.g., /health,/public)
 *   LOGIN_REDIRECT_URL — URL to redirect unauthenticated users to (optional)
 */

import express from "express";

const app = express();

const PORT = parseInt(process.env.PORT || "4181", 10);
const ORY_SDK_URL = process.env.ORY_SDK_URL || "http://localhost:4000";
const ALLOWED_PATHS = (process.env.ALLOWED_PATHS || "/health").split(",").map(p => p.trim());
const LOGIN_REDIRECT_URL = process.env.LOGIN_REDIRECT_URL;

interface OrySession {
  id: string;
  active: boolean;
  identity: {
    id: string;
    traits: {
      email?: string;
      name?: { first?: string; last?: string };
      [key: string]: unknown;
    };
    metadata_public?: Record<string, unknown>;
  };
  authenticator_assurance_level?: string;
  expires_at?: string;
}

/**
 * ForwardAuth endpoint — Traefik sends every request here.
 * We extract the cookie header and forward it to Ory's /sessions/whoami.
 */
app.all("*", async (req: express.Request, res: express.Response): Promise<void> => {
  // Allow configured public paths without auth
  const requestPath = req.headers["x-forwarded-uri"] as string || req.path;
  if (ALLOWED_PATHS.some(p => requestPath.startsWith(p))) {
    res.status(200).send("OK");
    return;
  }

  const cookieHeader = req.headers.cookie;
  const authHeader = req.headers.authorization;

  if (!cookieHeader && !authHeader) {
    handleUnauthorized(res, requestPath);
    return;
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (cookieHeader) headers.Cookie = cookieHeader;
    if (authHeader) headers.Authorization = authHeader;

    const sessionRes = await fetch(`${ORY_SDK_URL}/sessions/whoami`, {
      headers,
    });

    if (!sessionRes.ok) {
      handleUnauthorized(res, requestPath);
      return;
    }

    const session = (await sessionRes.json()) as OrySession;

    if (!session.active) {
      handleUnauthorized(res, requestPath);
      return;
    }

    // Set identity headers for upstream services
    res.setHeader("X-User-Id", session.identity.id);
    res.setHeader("X-Session-Id", session.id);

    if (session.identity.traits.email) {
      res.setHeader("X-User-Email", session.identity.traits.email);
    }

    const name = [
      session.identity.traits.name?.first,
      session.identity.traits.name?.last,
    ].filter(Boolean).join(" ");
    if (name) {
      res.setHeader("X-User-Name", name);
    }

    if (session.authenticator_assurance_level) {
      res.setHeader("X-Auth-AAL", session.authenticator_assurance_level);
    }

    // Pass metadata as JSON header if present
    if (session.identity.metadata_public && Object.keys(session.identity.metadata_public).length > 0) {
      res.setHeader(
        "X-User-Metadata",
        JSON.stringify(session.identity.metadata_public),
      );
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Failed to validate session with Ory:", (err as Error).message);
    res.status(503).json({ error: "Authentication service unavailable" });
  }
});

function handleUnauthorized(res: express.Response, requestPath: string): void {
  if (LOGIN_REDIRECT_URL) {
    const redirectUrl = `${LOGIN_REDIRECT_URL}?return_to=${encodeURIComponent(requestPath)}`;
    res.setHeader("Location", redirectUrl);
    res.status(302).send();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Traefik ForwardAuth handler listening on port ${PORT}`);
  });
}

export { app };
