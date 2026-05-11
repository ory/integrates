// SPDX-License-Identifier: Apache-2.0
//
// Ory session validator for Traefik's ForwardAuth middleware.
//
// Traefik calls this service on every inbound request (the ForwardAuth
// "address"). The service:
//   1. Lets configured public paths through with 200.
//   2. Forwards the user's Cookie / Authorization / X-Session-Token headers
//      to Ory's /sessions/whoami.
//   3. On a valid session, replies 200 with response headers carrying
//      identity context (X-User-Id, X-User-Email, X-User-Name, X-Session-Id,
//      X-Auth-AAL, optional X-User-Metadata). Traefik then copies the
//      configured authResponseHeaders into the upstream request.
//   4. On no session, replies 401 (or 302 to LOGIN_REDIRECT_URL when set,
//      preserving the original path in ?return_to=...).
//   5. On Ory outage, replies 503 so Traefik returns a clear gateway error
//      rather than treating it as "unauthorized".
//
// NOT a webhook integration. type: session-validation in registry.entry.yaml.

import "dotenv/config";
import express, { type Request, type Response } from "express";

const PORT = Number(process.env.PORT) || 4181;
const ORY_SDK_URL = process.env.ORY_SDK_URL;
const LOGIN_REDIRECT_URL = process.env.LOGIN_REDIRECT_URL || "";
const ALLOWED_PATHS = (process.env.ALLOWED_PATHS || "/health")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

if (!ORY_SDK_URL) {
  console.error("ORY_SDK_URL must be set (e.g. https://<project>.projects.oryapis.com)");
  process.exit(1);
}

interface OrySession {
  id?: string;
  active?: boolean;
  authenticator_assurance_level?: string;
  identity?: {
    id?: string;
    traits?: {
      email?: string;
      name?: { first?: string; last?: string };
    };
    metadata_public?: Record<string, unknown>;
  };
}

const app = express();

function isPublicPath(requestPath: string): boolean {
  // Exact match or prefix match with a path separator so /health doesn't
  // accidentally match /healthadmin.
  for (const p of ALLOWED_PATHS) {
    if (requestPath === p) return true;
    if (requestPath.startsWith(p + "/")) return true;
  }
  return false;
}

function unauthorized(res: Response, requestPath: string): void {
  if (LOGIN_REDIRECT_URL) {
    const sep = LOGIN_REDIRECT_URL.includes("?") ? "&" : "?";
    res.setHeader(
      "Location",
      `${LOGIN_REDIRECT_URL}${sep}return_to=${encodeURIComponent(requestPath)}`,
    );
    res.status(302).end();
    return;
  }
  res.status(401).json({ error: "unauthorized" });
}

app.all("*", async (req: Request, res: Response) => {
  // Traefik exposes the original request path via X-Forwarded-Uri.
  const requestPath = req.header("x-forwarded-uri") || req.path;

  if (isPublicPath(requestPath)) {
    res.status(200).end();
    return;
  }

  const cookieHeader = req.header("cookie");
  const authHeader = req.header("authorization");
  const sessionTokenHeader = req.header("x-session-token");

  if (!cookieHeader && !authHeader && !sessionTokenHeader) {
    unauthorized(res, requestPath);
    return;
  }

  const fwd: Record<string, string> = { accept: "application/json" };
  if (cookieHeader) fwd.cookie = cookieHeader;
  if (authHeader) fwd.authorization = authHeader;
  if (sessionTokenHeader) fwd["x-session-token"] = sessionTokenHeader;

  try {
    const sessionRes = await fetch(`${ORY_SDK_URL}/sessions/whoami`, {
      headers: fwd,
      signal: AbortSignal.timeout(5000),
    });

    if (sessionRes.status === 401 || sessionRes.status === 403) {
      unauthorized(res, requestPath);
      return;
    }
    if (!sessionRes.ok) {
      console.error(`Ory whoami returned ${sessionRes.status}`);
      res.status(503).json({ error: "auth_service_unavailable" });
      return;
    }

    const session = (await sessionRes.json()) as OrySession;
    if (!session?.active) {
      unauthorized(res, requestPath);
      return;
    }

    const identity = session.identity ?? {};
    const traits = identity.traits ?? {};

    res.setHeader("X-User-Id", identity.id ?? "");
    res.setHeader("X-Session-Id", session.id ?? "");
    if (traits.email) res.setHeader("X-User-Email", traits.email);

    const fullName = [traits.name?.first, traits.name?.last]
      .filter((s): s is string => Boolean(s))
      .join(" ");
    if (fullName) res.setHeader("X-User-Name", fullName);

    if (session.authenticator_assurance_level) {
      res.setHeader("X-Auth-AAL", session.authenticator_assurance_level);
    }
    if (
      identity.metadata_public &&
      Object.keys(identity.metadata_public).length > 0
    ) {
      res.setHeader("X-User-Metadata", JSON.stringify(identity.metadata_public));
    }

    res.status(200).end();
  } catch (err) {
    console.error(`Ory whoami request failed: ${(err as Error).message}`);
    res.status(503).json({ error: "auth_service_unavailable" });
  }
});

app.listen(PORT, () => {
  console.log(`Traefik ForwardAuth service listening on port ${PORT}`);
});
