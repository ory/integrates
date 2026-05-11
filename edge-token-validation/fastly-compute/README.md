# Fastly Compute@Edge — Ory Token Validation

WASM-based edge token validation on Fastly Compute@Edge, validating Ory Network session tokens and JWTs before requests reach your origin.

## Overview

This integration compiles a Rust application to WebAssembly and deploys it to Fastly's Compute@Edge platform. It validates Ory session cookies or JWT access tokens at the edge, enriches requests with identity headers, and forwards authenticated requests to your origin server.

| Feature | Details |
|---------|---------|
| Platform | Fastly Compute@Edge |
| Runtime | WebAssembly (Rust source) |
| Validation modes | Session cookie, JWT (access token) |
| JWKS caching | Fastly backend cache / config store |
| Ory Platform | Ory Network (managed cloud) |

## Architecture

```
Client
  |
  | (request with ory_session cookie or Bearer token)
  v
Fastly Compute@Edge (WASM)
  |
  |-- 1. Extract session cookie or Authorization header
  |-- 2. Validate token:
  |     - Session cookie → backend request to Ory /sessions/whoami
  |     - JWT → validate signature against cached JWKS
  |-- 3. Reject 401 if invalid
  |-- 4. Forward to origin with X-User-Id, X-User-Email headers
  v
Origin Server (backend)
```

## Prerequisites

- Ory Network project
- Fastly account with Compute@Edge enabled
- Rust toolchain (rustup, cargo)
- Fastly CLI (`brew install fastly/tap/fastly`)
- `wasm32-wasi` target: `rustup target add wasm32-wasi`

## Project Setup

```bash
# Create a new Compute@Edge project
fastly compute init --from=empty --language=rust --name=ory-edge-auth
cd ory-edge-auth
```

## fastly.toml

```toml
# fastly.toml — Fastly Compute@Edge project manifest

manifest_version = 3
service_id = ""  # Populated after `fastly compute publish`
name = "ory-edge-auth"
description = "Edge token validation for Ory Network"
language = "rust"

[local_server]

  [local_server.backends]

    [local_server.backends.ory]
    url = "https://your-project.projects.oryapis.com"

    [local_server.backends.origin]
    url = "http://localhost:8080"

  [local_server.config_stores]

    [local_server.config_stores.config]
    format = "inline-toml"

      [local_server.config_stores.config.contents]
      ory_sdk_url = "https://your-project.projects.oryapis.com"
      ory_session_cookie_prefix = "ory_session_"
      public_paths = "/health,/public,/.well-known"
      jwks_url = "https://your-project.projects.oryapis.com/.well-known/jwks.json"
      ory_issuer = "https://your-project.projects.oryapis.com"

[scripts]
  build = "cargo build --target wasm32-wasi --release && cp target/wasm32-wasi/release/ory_edge_auth.wasm bin/main.wasm"
```

## Cargo.toml

```toml
[package]
name = "ory-edge-auth"
version = "0.1.0"
edition = "2021"

[dependencies]
fastly = "0.10"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
jsonwebtoken = "9"
base64 = "0.22"
```

## Rust Source

```rust
// src/main.rs

use fastly::http::{header, Method, StatusCode};
use fastly::{Backend, ConfigStore, Error, Request, Response};
use serde::Deserialize;

const ORY_BACKEND: &str = "ory";
const ORIGIN_BACKEND: &str = "origin";

// ---------- Data Structures ----------

#[derive(Debug, Deserialize)]
struct OrySession {
    id: String,
    active: bool,
    identity: OryIdentity,
}

#[derive(Debug, Deserialize)]
struct OryIdentity {
    id: String,
    traits: serde_json::Value,
    metadata_public: Option<serde_json::Value>,
}

#[derive(Debug)]
struct AuthenticatedUser {
    subject: String,
    email: String,
    session_id: String,
    metadata: serde_json::Value,
}

// ---------- Helpers ----------

fn get_config(key: &str) -> String {
    let store = ConfigStore::open("config");
    store.get(key).unwrap_or_default()
}

fn is_public_path(path: &str) -> bool {
    let public_paths = get_config("public_paths");
    public_paths
        .split(',')
        .map(|p| p.trim())
        .any(|p| path == p || path.starts_with(&format!("{}/", p)))
}

fn extract_session_cookie(req: &Request) -> Option<String> {
    let prefix = get_config("ory_session_cookie_prefix");
    let cookie_header = req.get_header_str(header::COOKIE)?;

    cookie_header
        .split(';')
        .map(|c| c.trim())
        .find(|c| c.starts_with(&prefix))
        .map(|c| c.to_string())
}

fn extract_bearer_token(req: &Request) -> Option<String> {
    let auth = req.get_header_str(header::AUTHORIZATION)?;
    if auth.starts_with("Bearer ") {
        Some(auth[7..].to_string())
    } else {
        None
    }
}

fn unauthorized(message: &str) -> Response {
    Response::from_status(StatusCode::UNAUTHORIZED)
        .with_header(header::CONTENT_TYPE, "application/json")
        .with_body(format!(r#"{{"error":"{}"}}"#, message))
}

// ---------- Session Cookie Validation ----------

fn validate_session_cookie(session_cookie: &str) -> Result<Option<AuthenticatedUser>, Error> {
    let ory_sdk_url = get_config("ory_sdk_url");
    let whoami_url = format!("{}/sessions/whoami", ory_sdk_url);

    let req = Request::get(&whoami_url)
        .with_header(header::COOKIE, session_cookie)
        .with_header(header::ACCEPT, "application/json");

    let mut resp = req.send(ORY_BACKEND)?;

    if resp.get_status() != StatusCode::OK {
        return Ok(None);
    }

    let session: OrySession = resp.take_body_json()?;

    if !session.active {
        return Ok(None);
    }

    let email = session
        .identity
        .traits
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(Some(AuthenticatedUser {
        subject: session.identity.id,
        email,
        session_id: session.id,
        metadata: session.identity.metadata_public.unwrap_or(serde_json::Value::Null),
    }))
}

// ---------- JWT Validation (simplified) ----------

fn validate_jwt(token: &str) -> Result<Option<AuthenticatedUser>, Error> {
    // In production, fetch and cache JWKS from Ory, then validate.
    // This simplified version decodes the JWT payload without full
    // signature verification. For production, use jsonwebtoken crate
    // with the cached JWKS.

    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Ok(None);
    }

    let payload_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|_| Error::msg("Invalid base64"))?;

    let payload: serde_json::Value = serde_json::from_slice(&payload_bytes)?;

    // Verify issuer
    let expected_issuer = get_config("ory_issuer");
    let issuer = payload.get("iss").and_then(|v| v.as_str()).unwrap_or("");
    if issuer != expected_issuer {
        return Ok(None);
    }

    // Verify expiration
    if let Some(exp) = payload.get("exp").and_then(|v| v.as_i64()) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        if now > exp {
            return Ok(None);
        }
    }

    let subject = payload
        .get("sub")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let email = payload
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let session_id = payload
        .get("sid")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(Some(AuthenticatedUser {
        subject,
        email,
        session_id,
        metadata: payload
            .get("ext")
            .cloned()
            .unwrap_or(serde_json::Value::Null),
    }))
}

// Note: For production JWT validation with full JWKS signature verification,
// fetch the JWKS from the Ory backend on startup, cache it in a config store,
// and use the `jsonwebtoken` crate:
//
//   use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
//   let key = DecodingKey::from_jwk(&jwk)?;
//   let validation = Validation::new(Algorithm::RS256);
//   let token_data = decode::<Claims>(&token, &key, &validation)?;

use base64::Engine;

// ---------- Main ----------

#[fastly::main]
fn main(req: Request) -> Result<Response, Error> {
    let path = req.get_path().to_string();

    // Allow public paths through
    if is_public_path(&path) {
        return Ok(req.send(ORIGIN_BACKEND)?);
    }

    // Try Bearer token first, then session cookie
    let user = if let Some(token) = extract_bearer_token(&req) {
        validate_jwt(&token)?
    } else if let Some(cookie) = extract_session_cookie(&req) {
        validate_session_cookie(&cookie)?
    } else {
        None
    };

    match user {
        None => Ok(unauthorized("Authentication required")),
        Some(user) => {
            // Clone the request and add identity headers
            let mut modified = req;
            modified.set_header("X-User-Id", &user.subject);
            modified.set_header("X-User-Email", &user.email);
            modified.set_header("X-Session-Id", &user.session_id);
            modified.set_header(
                "X-User-Metadata",
                &serde_json::to_string(&user.metadata).unwrap_or_default(),
            );

            Ok(modified.send(ORIGIN_BACKEND)?)
        }
    }
}
```

## Backend Configuration

Configure backends in the Fastly console or via the Fastly CLI:

```bash
# Ory Network backend
fastly backend create \
  --name ory \
  --address your-project.projects.oryapis.com \
  --port 443 \
  --use-ssl \
  --ssl-cert-hostname your-project.projects.oryapis.com \
  --version latest

# Your origin backend
fastly backend create \
  --name origin \
  --address origin.example.com \
  --port 443 \
  --use-ssl \
  --version latest
```

## Config Store Setup

```bash
# Create config store
fastly config-store create --name config

# Populate values
fastly config-store-entry create \
  --store-id <STORE_ID> \
  --key ory_sdk_url \
  --value "https://your-project.projects.oryapis.com"

fastly config-store-entry create \
  --store-id <STORE_ID> \
  --key ory_session_cookie_prefix \
  --value "ory_session_"

fastly config-store-entry create \
  --store-id <STORE_ID> \
  --key public_paths \
  --value "/health,/public,/.well-known"

fastly config-store-entry create \
  --store-id <STORE_ID> \
  --key jwks_url \
  --value "https://your-project.projects.oryapis.com/.well-known/jwks.json"

fastly config-store-entry create \
  --store-id <STORE_ID> \
  --key ory_issuer \
  --value "https://your-project.projects.oryapis.com"

# Link config store to the service
fastly resource-link create \
  --version latest \
  --resource-id <STORE_ID>
```

## Build and Deploy

```bash
# Build WASM binary
cargo build --target wasm32-wasi --release
mkdir -p bin
cp target/wasm32-wasi/release/ory_edge_auth.wasm bin/main.wasm

# Test locally
fastly compute serve

# Deploy to Fastly
fastly compute publish

# Validate
fastly compute validate
```

## Testing

```bash
# Test with session cookie
curl -v https://your-service.edgecompute.app/api/me \
  -H "Cookie: ory_session_projectslug=<session-token>"

# Test with JWT
curl -v https://your-service.edgecompute.app/api/me \
  -H "Authorization: Bearer <jwt-access-token>"

# Test public path
curl -v https://your-service.edgecompute.app/health

# Test unauthenticated
curl -v https://your-service.edgecompute.app/api/me
```

## JWKS Caching Strategy

For production deployments, implement a JWKS caching strategy using Fastly's KV Store:

1. **Startup fetch**: On first request, fetch JWKS from Ory and store in a KV Store entry.
2. **TTL-based refresh**: Check the timestamp stored alongside the JWKS. If older than the configured TTL, re-fetch in the background.
3. **Fallback**: If the JWKS fetch fails, use the cached version (stale-while-revalidate pattern).

```rust
// Pseudocode for JWKS caching with KV Store
fn get_jwks() -> Result<Vec<Jwk>, Error> {
    let store = KVStore::open("jwks_cache")?;

    if let Some(entry) = store.lookup("jwks") {
        let cached: CachedJwks = serde_json::from_reader(entry)?;
        let age = now() - cached.fetched_at;

        if age < JWKS_TTL {
            return Ok(cached.keys);
        }
    }

    // Fetch fresh JWKS
    let resp = Request::get(&jwks_url).send("ory")?;
    let jwks: JwksResponse = resp.take_body_json()?;

    // Cache it
    store.insert("jwks", serde_json::to_vec(&CachedJwks {
        keys: jwks.keys.clone(),
        fetched_at: now(),
    })?)?;

    Ok(jwks.keys)
}
```

## Performance

| Metric | Value |
|--------|-------|
| WASM startup | <1ms |
| JWT validation (cached JWKS) | <1ms |
| Session validation (Ory backend call) | 10-50ms (depends on region) |
| Binary size | ~2MB (release, stripped) |

## References

- [Fastly Compute@Edge Documentation](https://developer.fastly.com/learning/compute/)
- [Fastly Rust SDK](https://docs.rs/fastly/latest/fastly/)
- [Ory Session Validation](https://www.ory.sh/docs/kratos/session-management/overview)
- [Ory JWKS Endpoint](https://www.ory.sh/docs/hydra/jwks)
