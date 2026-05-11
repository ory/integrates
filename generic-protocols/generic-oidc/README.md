# Generic OIDC Provider Integration with Ory Network

## Overview

Ory Network supports integration with any OpenID Connect (OIDC) compliant Identity Provider (IdP) as a social sign-in or enterprise SSO provider. This guide covers configuring a generic OIDC provider with Ory Kratos, applicable to any IdP that implements the OpenID Connect Core specification (e.g., Keycloak, Okta, Auth0, PingFederate, ForgeRock, Authentik, or custom OIDC servers).

Key capabilities:
- Standard OIDC Authorization Code flow
- OIDC Discovery for automatic endpoint configuration
- Customizable claim-to-trait mapping via Jsonnet
- Support for PKCE (Proof Key for Code Exchange)
- Compatible with any OIDC-compliant provider

Ory documentation: https://www.ory.sh/docs/kratos/social-signin/generic

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │
│   User       │─1─▶│  Ory Kratos  │─2─▶│  OIDC IdP    │
│   Browser    │    │  (OIDC RP)   │    │  (Generic)   │
│              │    │              │    │              │
│              │◀─5─│              │◀─3─│              │
└──────────────┘    └──────┬───────┘    └──────────────┘
                           │
                           4 (token exchange + userinfo)
                           │
                    ┌──────▼───────┐
                    │  Ory Identity │
                    │  Created/     │
                    │  Updated      │
                    └──────────────┘

Flow:
1. User clicks "Sign in with [Provider]"
2. Ory redirects to IdP Authorization Endpoint
3. User authenticates at IdP; IdP returns authorization code
4. Ory exchanges code for tokens, fetches userinfo
5. Ory creates/updates identity, redirects user to application
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Relying Party (RP). Manages OIDC flows, token exchange, and identity mapping. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **OIDC Provider**: Any OIDC-compliant IdP with:
  - OIDC Discovery endpoint (`/.well-known/openid-configuration`)
  - Registered client (Client ID + Client Secret)
  - Redirect URI configured

## Configuration

### Step 1: Register Ory as an OIDC Client at the IdP

Register a new OIDC client at your IdP with the following settings:

| Setting | Value |
|---------|-------|
| **Client Type** | Confidential (server-side) |
| **Redirect URI** | `https://<your-ory-project>.projects.oryapis.com/self-service/methods/oidc/callback/<provider-id>` |
| **Grant Type** | Authorization Code |
| **Response Type** | `code` |
| **Scopes** | `openid`, `profile`, `email` |

Note the **Client ID**, **Client Secret**, and **Issuer URL** (the base URL for OIDC Discovery).

### Step 2: Verify OIDC Discovery

```bash
curl -s https://<idp-issuer-url>/.well-known/openid-configuration | \
  jq '{authorization_endpoint, token_endpoint, userinfo_endpoint, jwks_uri}'
```

### Step 3: Configure Ory OIDC Provider

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/methods/oidc/enabled=true' \
  --add '/selfservice/methods/oidc/config/providers/0/id="my-oidc-provider"' \
  --add '/selfservice/methods/oidc/config/providers/0/provider="generic"' \
  --add '/selfservice/methods/oidc/config/providers/0/client_id="<client-id>"' \
  --add '/selfservice/methods/oidc/config/providers/0/client_secret="<client-secret>"' \
  --add '/selfservice/methods/oidc/config/providers/0/issuer_url="https://<idp-issuer-url>"' \
  --add '/selfservice/methods/oidc/config/providers/0/label="Sign in with My Provider"' \
  --add '/selfservice/methods/oidc/config/providers/0/scope=["openid","profile","email"]' \
  --add '/selfservice/methods/oidc/config/providers/0/mapper_url="file:///etc/config/kratos/oidc-mapper.jsonnet"'
```

Or via the Ory Console:
1. Navigate to **Authentication > Social Sign-In**
2. Click **Add Provider**
3. Select **Generic OIDC**
4. Enter the Client ID, Client Secret, and Issuer URL
5. Configure claim mapping

### Step 4: Create Claim Mapper (Jsonnet)

**`oidc-mapper.jsonnet`:**

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      // Map standard OIDC claims to Ory identity traits
      [if std.objectHas(claims, 'email') then 'email']: claims.email,
      [if std.objectHas(claims, 'name') || std.objectHas(claims, 'given_name') then 'name']: {
        [if std.objectHas(claims, 'given_name') then 'first']: claims.given_name,
        [if std.objectHas(claims, 'family_name') then 'last']: claims.family_name,
      },
    },
    metadata_public: {
      // Store provider-specific data in metadata
      oidc_provider: {
        subject: claims.sub,
        issuer: if std.objectHas(claims, 'iss') then claims.iss else null,
        email_verified: if std.objectHas(claims, 'email_verified') then claims.email_verified else null,
      },
    },
  },
}
```

### Step 5: Advanced Configuration Options

**PKCE (recommended for enhanced security):**

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/methods/oidc/config/providers/0/pkce="auto"'
```

PKCE values: `auto` (use if supported), `force` (always use), `never` (disable).

**Token Endpoint Auth Method:**

```bash
# Default: client_secret_post
# Alternatives: client_secret_basic, private_key_jwt
ory patch identity-config --project <project-id> \
  --add '/selfservice/methods/oidc/config/providers/0/token_endpoint_auth_method="client_secret_basic"'
```

**Requested Claims (for providers that support claims parameter):**

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/methods/oidc/config/providers/0/requested_claims={"id_token":{"email":{"essential":true},"email_verified":{"essential":true}}}'
```

## Standard OIDC Claims Reference

| Claim | Type | Description | Typical Trait Mapping |
|-------|------|-------------|----------------------|
| `sub` | string | Unique identifier at the IdP | Provider credential identifier |
| `email` | string | Email address | `traits.email` |
| `email_verified` | boolean | Whether email is verified | `metadata_public.email_verified` |
| `name` | string | Full name | Parsed into first/last |
| `given_name` | string | First name | `traits.name.first` |
| `family_name` | string | Last name | `traits.name.last` |
| `picture` | string | Profile photo URL | `metadata_public.avatar` |
| `locale` | string | User locale (e.g., `en-US`) | `traits.locale` |
| `phone_number` | string | Phone number | `traits.phone` |

## Testing

### 1. Test OIDC Flow

1. Navigate to your application's login page
2. Click "Sign in with My Provider"
3. Authenticate at the IdP
4. Verify redirect back to your application with an active session

### 2. Verify Identity Creation

```bash
ory list identities --project <project-id> --format json | \
  jq '.[] | select(.traits.email == "user@example.com")'
```

### 3. Check OIDC Credentials

```bash
ory get identity <identity-id> --project <project-id> --format json | \
  jq '.credentials.oidc'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **"Discovery failed"** | IdP discovery URL unreachable | Verify `issuer_url` is correct and `/.well-known/openid-configuration` returns valid JSON |
| **"Redirect URI mismatch"** | Callback URL not registered at IdP | Add the exact callback URL to the IdP's registered redirect URIs |
| **"Invalid client"** | Client ID or secret wrong | Verify credentials match IdP configuration |
| **Missing email claim** | `email` scope not requested or not returned | Add `email` to scopes; check IdP user has email configured |
| **Duplicate identity** | Different IdP subjects resolving to same email | Configure account linking in Ory |
| **Jsonnet mapper error** | Claim name mismatch | Check actual claims by enabling debug logging; adjust mapper |

## Resources

- [Ory Generic OIDC Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/generic)
- [Ory Social Sign-In Overview](https://www.ory.sh/docs/kratos/social-signin/overview)
- [Ory Jsonnet Data Mapping](https://www.ory.sh/docs/kratos/social-signin/data-mapping)
- [OpenID Connect Core Specification](https://openid.net/specs/openid-connect-core-1_0.html)
- [OpenID Connect Discovery](https://openid.net/specs/openid-connect-discovery-1_0.html)
- [PKCE (RFC 7636)](https://datatracker.ietf.org/doc/html/rfc7636)
