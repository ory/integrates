# Traefik

> **Maintained by:** Community contributors

[Traefik](https://traefik.io) is a cloud-native reverse proxy and load balancer with native integrations for Docker, Kubernetes, and other orchestrators. This integration uses Traefik's **ForwardAuth middleware** plus a small Ory session validator to authenticate every inbound request before it reaches your backend. The validator exchanges the user's session cookie or token for an `/sessions/whoami` lookup against Ory and converts the result into headers (`X-User-Id`, `X-User-Email`, `X-Auth-AAL`, etc.) that Traefik attaches to the upstream request.

**Type:** session-validation (Traefik ForwardAuth target — *not* an Ory Action webhook)
**Docs page:** [ory.com/docs/integrates-with/api-gateways/traefik](https://www.ory.com/docs/integrates-with/api-gateways/traefik)

## Use case

A platform team runs Traefik as the cluster's ingress and wants Ory to be the single authority on "who is calling this API?" without making each upstream service re-implement session validation. Traefik calls this ForwardAuth service on every request; valid sessions pass through with identity headers, invalid sessions are rejected (or redirected to login) at the edge.

## How it works

1. A client sends a request to Traefik with an Ory session cookie (`ory_session_<project>`) or a session token (`X-Session-Token`) or a bearer token (`Authorization: Bearer ...`).
2. Traefik's ForwardAuth middleware forwards the request headers to this service.
3. Public paths (configured via `ALLOWED_PATHS`) pass through with a `200` immediately.
4. Otherwise, the service calls Ory's `GET /sessions/whoami` forwarding the user's `Cookie`, `Authorization`, and/or `X-Session-Token` headers.
5. If Ory returns an active session: the service replies `200` with identity response headers; Traefik copies the configured `authResponseHeaders` into the upstream request and routes through.
6. If Ory returns 401/403 or `active: false`: the service replies `401` — or `302` to `LOGIN_REDIRECT_URL` preserving the original path in `?return_to=...` — and Traefik returns that to the client.
7. If Ory is unreachable: the service replies `503` so Traefik surfaces a clear gateway error rather than treating an outage as "unauthorized".

## Prerequisites

- Traefik v2.x or v3.x with `forwardAuth` middleware support.
- An Ory Network project (or self-hosted Kratos).
- A deployment target for the validator service (any Node.js runtime: a sidecar, a deployment, Cloud Run, etc.). The service is stateless and horizontally scalable.

## Deploy the ForwardAuth service

```bash
cd forwardauth/
cp .env.example .env
# Fill in ORY_SDK_URL, optionally ALLOWED_PATHS and LOGIN_REDIRECT_URL.
npm install
npm start
```

Or build the container image with the included `Dockerfile`:

```bash
docker build -t ory-forwardauth forwardauth/
docker run -p 4181:4181 -e ORY_SDK_URL=https://<project>.projects.oryapis.com ory-forwardauth
```

The service listens on the port specified in `.env` (default 4181) and answers Traefik's ForwardAuth requests on **every path**: it validates the session and emits identity headers, or returns 401/302.

## Wire up Traefik

Reference Traefik configurations are in [`traefik/`](traefik):

- [`traefik/dynamic-config.yaml`](traefik/dynamic-config.yaml) — File-provider dynamic config defining the `ory-auth` middleware and example routers.
- [`traefik/docker-compose.yaml`](traefik/docker-compose.yaml) — Local stack: Traefik + this service + a placeholder backend.
- [`traefik/kubernetes-ingress.yaml`](traefik/kubernetes-ingress.yaml) — Traefik IngressRoute CRDs (`Middleware` + protected/public `IngressRoute`).

The middleware is set up to copy these headers from the auth response into the upstream request:

- `X-User-Id` — Ory identity ID.
- `X-User-Email` — `identity.traits.email`. Omitted when it contains non-ASCII characters.
- `X-User-Name` — concatenated `identity.traits.name.first` + `last`. Omitted when it contains non-ASCII characters, because header values must be ASCII.
- `X-Session-Id` — Ory session ID.
- `X-Auth-AAL` — Authenticator Assurance Level (`aal1` / `aal2`).
- `X-User-Metadata` — JSON-stringified `identity.metadata_public` (when present and non-empty), with non-ASCII characters escaped as `\uXXXX`. Decode it with a JSON parser.

Traefik replaces each header listed in `authResponseHeaders` with the validator's value, or removes it when the validator doesn't set it, so a client can't supply these headers on protected routes. Keep every identity header your upstream trusts in that list. Routes that skip `ory-auth`, such as the public routes in the examples, use the `strip-identity-headers` middleware to remove them.

On Traefik 3.7.12 or later, also set `http.aliasHeadersStrategy: delete` on each entrypoint (the compose file passes `--entrypoints.<name>.http.aliasHeadersStrategy=delete`). Traefik then deletes header names that contain dots, underscores, or other characters outside letters, digits, and hyphens, so a backend that normalizes header names can't read `X_User_Id` as `X-User-Id`. See [Traefik's entrypoint reference](https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/#aliasheadersstrategy).

Don't set `trustForwardHeader: true` on the middleware unless every client reaching Traefik is a trusted proxy. The validator reads the request path from `X-Forwarded-Uri` to decide which paths are public.

Pointing `forwardAuth.address` straight at Ory's `/sessions/whoami` also works for gating, but `whoami` sets only the `X-Kratos-Authenticated-Identity-Id` response header, so the upstream receives no `X-User-*` headers. Use this validator to forward more identity data.

Detailed setup with Kubernetes, sidecar deployments, and the JWKS-based alternative (for pure JWT validation without round-tripping Ory): see the [docs page](https://ory.com/docs/integrates-with/api-gateways/traefik).

## Troubleshooting

- **Every request returns `401`** — the user's session cookie isn't reaching the service. Check Traefik's `forwardAuth` middleware includes `authRequestHeaders: [Cookie, Authorization, X-Session-Token]` (or omit the field so all headers are forwarded), and confirm the cookie domain covers the Traefik hostname.
- **Service returns `503`** — `ORY_SDK_URL` is wrong or unreachable from the service's pod/container. Try `curl $ORY_SDK_URL/sessions/whoami` from inside the container.
- **Public paths still require auth** — `ALLOWED_PATHS` checks the path without its query string, by exact match or prefix match with a trailing `/`. `/health` matches `/health` and `/health/...` but not `/healthadmin`.
- **`302` redirects to login but `return_to` is wrong** — the service reads the original path from `X-Forwarded-Uri`, which Traefik sets on every ForwardAuth request.
- **Identity headers don't reach the upstream** — Traefik's `authResponseHeaders` doesn't list the header you expect. Add the header name to that list in the middleware definition.

## License

Apache-2.0. SPDX header at the top of each source file.
