# Generic OIDC Provider Integration with Ory Network

## Overview

This integration guide covers configuring Ory Polis as an OpenID Connect (OIDC) Relying Party (RP) with any OIDC-compliant Identity Provider (OP). Use this guide when your IdP supports OIDC/OAuth 2.0 and is not covered by a provider-specific guide, or when you need to understand the underlying OIDC mechanics for any OIDC-based SSO integration with Ory.

OpenID Connect 1.0 is an identity layer built on top of OAuth 2.0. It allows clients to verify the identity of an end-user based on authentication performed by an authorization server, and to obtain basic profile information in an interoperable REST-like manner.

Common IdPs that can use this generic OIDC guide:
- AWS Cognito
- IBM Security Verify
- ForgeRock/PingForge
- WSO2 Identity Server
- Authentik
- Authelia
- Casdoor
- Zitadel
- GitLab (self-managed)
- Any OAuth 2.0 / OIDC-compliant IdP

## Integration Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Application   │────1───▶│   Ory Polis     │────2───▶│   Any OIDC      │
│   (Your App)    │         │   (OIDC RP)     │         │   Provider (OP) │
│                 │◀───6────│                 │◀───3────│                 │
│                 │         │                 │         │                 │
└─────────────────┘         └────────┬────────┘         └─────────────────┘
                                     │                           │
                                     │                    ┌──────▼──────┐
                                     5                    │  UserInfo   │
                                     │                    │  Endpoint   │
                            ┌────────▼────────┐           └─────────────┘
                            │  Ory Identity   │
                            │  (Kratos)       │          4: Token exchange
                            │  User Created/  │          (authorization code
                            │  Updated        │           → ID token +
                            └─────────────────┘           access token)

Flow:
1. User accesses application, redirected to Ory Polis login
2. Ory Polis redirects to IdP's authorization endpoint
3. User authenticates at IdP, IdP redirects back with authorization code
4. Ory Polis exchanges code for ID token + access token at token endpoint
5. Ory Polis creates/updates identity in Ory Kratos from ID token claims
6. User redirected back to application with active session
```

### Detailed OIDC Authorization Code Flow

```
User Agent            Ory Polis (RP)              IdP (OP)
    │                      │                       │
    │──── Login ──────────▶│                       │
    │                      │                       │
    │◀── 302 Redirect ─────│                       │
    │    /authorize?        │                       │
    │    response_type=code │                       │
    │    &client_id=...     │                       │
    │    &redirect_uri=...  │                       │
    │    &scope=openid...   │                       │
    │    &state=...         │                       │
    │    &nonce=...         │                       │
    │                      │                       │
    │──── GET /authorize ──────────────────────────▶│
    │                      │                       │
    │◀────── Login Form ───────────────────────────│
    │                      │                       │
    │──── Credentials ─────────────────────────────▶│
    │                      │                       │
    │◀── 302 Redirect ─────────────────────────────│
    │    /callback?code=... │                       │
    │    &state=...         │                       │
    │                      │                       │
    │──── GET /callback ──▶│                       │
    │                      │                       │
    │                      │── POST /token ───────▶│
    │                      │   (code, client creds) │
    │                      │                       │
    │                      │◀── ID Token + ────────│
    │                      │    Access Token        │
    │                      │                       │
    │                      │── GET /userinfo ──────▶│
    │                      │   (access_token)       │  (optional)
    │                      │                       │
    │                      │◀── User Claims ───────│
    │                      │                       │
    │◀── 302 + Session ────│                       │
    │                      │                       │
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Polis** | OIDC Relying Party. Manages the SSO connection, handles authorization code flow, and validates ID tokens. |
| **Ory Kratos** | Identity management. Creates and updates identity records from OIDC ID token claims and UserInfo. |
| **Ory Hydra** | OAuth2/OIDC token issuance for downstream applications after SSO. |

## Prerequisites

- **OIDC-Compliant IdP**: Any IdP that implements OpenID Connect 1.0 Core
- **IdP Admin Access**: Ability to register OAuth2/OIDC clients
- **OIDC Discovery Endpoint**: `/.well-known/openid-configuration` URL from the IdP
- **Client Credentials**: Client ID and Client Secret from the IdP
- **Ory Network Account**: Active project with Polis enabled
- **Verified Domain**: Organization email domain verified in Ory Network

## Configuration

### Step 1: Locate the IdP's OIDC Discovery Endpoint

Every OIDC-compliant IdP exposes a discovery document at:

```
https://{idp-domain}/.well-known/openid-configuration
```

This JSON document contains all endpoints and capabilities. Verify it:

```bash
curl -s "https://{idp-domain}/.well-known/openid-configuration" | jq .
```

Key fields from the discovery document:

| Field | Description |
|-------|-------------|
| `issuer` | The IdP's issuer identifier |
| `authorization_endpoint` | URL for the authorization request |
| `token_endpoint` | URL for the token exchange |
| `userinfo_endpoint` | URL for fetching user profile claims |
| `jwks_uri` | URL for the IdP's JSON Web Key Set (for token verification) |
| `scopes_supported` | Available OAuth2 scopes |
| `response_types_supported` | Supported response types |
| `id_token_signing_alg_values_supported` | Supported signing algorithms |

### Step 2: Register an OIDC Client at the IdP

Create a new OAuth2/OIDC client (sometimes called "application") at your IdP:

| Setting | Value |
|---------|-------|
| **Application Type** | Web Application (confidential client) |
| **Grant Type** | Authorization Code |
| **Redirect URI / Callback URL** | `https://{your-ory-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/{provider-id}` |
| **Post-Logout Redirect URI** | `https://{your-ory-project-slug}.projects.oryapis.com/self-service/logout/browser` (optional) |
| **Scopes** | `openid`, `profile`, `email` (minimum) |

Note the **Client ID** and **Client Secret** generated by the IdP.

### Step 3: Configure Ory Polis SSO Connection

```bash
ory create sso-connection \
  --project <project-id> \
  --provider oidc \
  --label "Enterprise OIDC SSO" \
  --issuer-url "https://{idp-domain}" \
  --client-id "<client-id>" \
  --client-secret "<client-secret>" \
  --scopes "openid,profile,email" \
  --organization-id <org-id>
```

### Step 4: Map Email Domains

```bash
ory update organization \
  --project <project-id> \
  --id <org-id> \
  --domains "yourdomain.com"
```

### Step 5: Manage SSO Connections

```bash
# List all SSO connections
ory list sso-connections --project <project-id>

# Get connection details
ory get sso-connection <connection-id> --project <project-id>

# Update connection
ory update sso-connection <connection-id> \
  --project <project-id> \
  --client-secret "<new-secret>"

# Delete connection
ory delete sso-connection <connection-id> --project <project-id>
```

## Technical Details

### OIDC Claim Mapping

| Standard OIDC Claim | Description | Ory Identity Trait |
|--------------------|-------------|-------------------|
| `sub` | Subject identifier (unique, stable) | `metadata_public.idp_sub` |
| `email` | Email address | `traits.email` |
| `email_verified` | Whether email is verified | (used for verification status) |
| `given_name` | First name | `traits.name.first` |
| `family_name` | Last name | `traits.name.last` |
| `name` | Full name | `traits.name.full` |
| `preferred_username` | Preferred username | `metadata_public.username` |
| `picture` | Profile picture URL | `metadata_public.picture` |
| `locale` | Locale preference | `metadata_public.locale` |
| `zoneinfo` | Time zone | `metadata_public.timezone` |
| `phone_number` | Phone number | `traits.phone` |
| `phone_number_verified` | Whether phone is verified | (used for verification status) |
| `address` | Address (JSON object) | `metadata_public.address` |
| `updated_at` | Last profile update timestamp | (internal use) |

### Custom Claims

Many IdPs support custom claims beyond the standard set. To map custom claims:

```bash
ory create sso-connection \
  --project <project-id> \
  --provider oidc \
  --label "Enterprise OIDC SSO" \
  --issuer-url "https://{idp-domain}" \
  --client-id "<client-id>" \
  --client-secret "<client-secret>" \
  --scopes "openid,profile,email,custom_scope" \
  --organization-id <org-id>
```

### OIDC Protocol Requirements

| Parameter | Value |
|-----------|-------|
| **OIDC Version** | OpenID Connect Core 1.0 |
| **Grant Type** | Authorization Code (required) |
| **Response Type** | `code` |
| **Token Endpoint Auth** | `client_secret_basic` or `client_secret_post` |
| **ID Token Signing** | RS256 (minimum), ES256 also supported |
| **PKCE** | Supported (optional for confidential clients) |
| **State Parameter** | Required (CSRF protection) |
| **Nonce Parameter** | Required (replay protection) |

### Common OIDC Discovery URL Patterns

| IdP | Discovery URL |
|-----|--------------|
| Auth0 | `https://{tenant}.auth0.com/.well-known/openid-configuration` |
| AWS Cognito | `https://cognito-idp.{region}.amazonaws.com/{pool-id}/.well-known/openid-configuration` |
| Okta | `https://{org}.okta.com/.well-known/openid-configuration` |
| Keycloak | `https://{host}/realms/{realm}/.well-known/openid-configuration` |
| Azure AD | `https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration` |
| Google | `https://accounts.google.com/.well-known/openid-configuration` |
| PingOne | `https://auth.pingone.com/{env-id}/as/.well-known/openid-configuration` |
| GitLab | `https://gitlab.com/.well-known/openid-configuration` |
| Authentik | `https://{host}/application/o/{app-slug}/.well-known/openid-configuration` |
| Zitadel | `https://{instance}.zitadel.cloud/.well-known/openid-configuration` |

### ID Token Structure

A standard OIDC ID token (JWT) contains:

```json
{
  "iss": "https://idp.yourdomain.com",
  "sub": "user-unique-id-12345",
  "aud": "your-client-id",
  "exp": 1737000300,
  "iat": 1737000000,
  "auth_time": 1736999990,
  "nonce": "random-nonce-value",
  "at_hash": "access-token-hash",
  "email": "user@yourdomain.com",
  "email_verified": true,
  "given_name": "Jane",
  "family_name": "Doe",
  "name": "Jane Doe",
  "preferred_username": "jdoe"
}
```

## Testing

### 1. Verify OIDC Discovery

```bash
curl -s "https://{idp-domain}/.well-known/openid-configuration" | jq .
```

Verify the response includes `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, and `jwks_uri`.

### 2. Verify JWKS Endpoint

```bash
curl -s "$(curl -s 'https://{idp-domain}/.well-known/openid-configuration' | jq -r '.jwks_uri')" | jq .
```

### 3. Test SP-Initiated SSO

1. Navigate to your application login page
2. Enter an email from the mapped domain
3. Authenticate at the IdP
4. Verify redirect with active session

### 4. Verify Identity Creation

```bash
ory list identities --project <project-id> --format json | \
  jq '.[] | select(.traits.email == "user@yourdomain.com")'
```

### 5. Inspect Token Claims

Use [jwt.io](https://jwt.io) or a similar tool to decode the ID token and verify claims are present.

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **`invalid_client`** | Wrong client ID or secret | Verify client credentials match the IdP registration |
| **`redirect_uri_mismatch`** | Callback URL not registered at IdP | Add the exact Ory callback URL to the IdP's allowed redirect URIs |
| **`invalid_scope`** | Requested scope not supported | Check `scopes_supported` in discovery document; request only supported scopes |
| **ID token signature invalid** | JWKS key rotation or mismatch | Verify the IdP's JWKS endpoint is accessible and contains the signing key |
| **`nonce` mismatch** | Token replay or session issue | Ensure the IdP includes the `nonce` claim in the ID token |
| **Email claim missing** | `email` scope not requested or not granted | Add `email` to the requested scopes; ensure user has email in IdP |
| **User not created** | Email claim missing from ID token | Verify the IdP returns the `email` claim; check UserInfo endpoint |
| **"No SSO connection found"** | Domain not mapped | Map the email domain via `ory update organization --domains` |
| **`access_denied`** | User not authorized at IdP | Check user assignment/group membership at the IdP |
| **Token endpoint error** | Wrong auth method | Try switching between `client_secret_basic` and `client_secret_post` |
| **CORS errors** | IdP blocking cross-origin requests | This should not occur in the Authorization Code flow (server-side exchange); check for misconfigurations |
| **Clock skew** | ID token `exp`/`iat` validation fails | Sync server clocks; most libraries allow 60-second tolerance |

### OIDC Debugging Checklist

1. Verify the discovery endpoint returns valid JSON with all required fields
2. Confirm client ID and secret are correct
3. Check that the redirect URI matches exactly (including trailing slashes)
4. Verify requested scopes are supported by the IdP
5. Ensure the IdP returns `email` in the ID token or UserInfo response
6. Check the JWKS endpoint is accessible for ID token signature verification
7. Verify the `iss` claim in the ID token matches the `issuer` in discovery
8. Test the token endpoint directly with curl if needed

## Resources

- [Ory Polis Generic OIDC SSO Documentation](https://www.ory.sh/docs/polis/sso-providers/generic-oidc)
- [Ory Polis SSO Overview](https://www.ory.sh/docs/polis/sso)
- [OpenID Connect Core 1.0 Specification](https://openid.net/specs/openid-connect-core-1_0.html)
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html)
- [OAuth 2.0 Authorization Framework (RFC 6749)](https://datatracker.ietf.org/doc/html/rfc6749)
- [JSON Web Token (RFC 7519)](https://datatracker.ietf.org/doc/html/rfc7519)
- [JSON Web Key (RFC 7517)](https://datatracker.ietf.org/doc/html/rfc7517)
- [jwt.io - JWT Debugger](https://jwt.io)
- [Ory CLI Reference](https://www.ory.sh/docs/cli)
