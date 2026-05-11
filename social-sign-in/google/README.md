# Sign in with Google - Ory Network Integration

## Overview

Google is the most ubiquitous social sign-in provider, with billions of Google accounts worldwide. Google supports both traditional OIDC and the newer FedCM (Federated Credential Management) API for privacy-preserving authentication. Integrating Google with Ory Network provides a frictionless sign-in experience that most users are already familiar with.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "google" provider)
       |
       v
  Google Authorization Endpoint
  (https://accounts.google.com/o/oauth2/v2/auth)
  — or via FedCM API (browser-native) —
       |
       v
  Google Login & Consent
       |
       v
  Google Token Endpoint
  (https://oauth2.googleapis.com/token)
       |
       v
  Google ID Token (JWT) / Userinfo
  (https://openidconnect.googleapis.com/v1/userinfo)
       |
       v
  Ory Kratos creates/updates identity
       |
       v
  User redirected to application
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management, built-in Google provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **Google Cloud Console Project** — Create at [console.cloud.google.com](https://console.cloud.google.com).
3. **OAuth Consent Screen** — Configure under APIs & Services > OAuth consent screen:
   - Choose **External** user type for public apps.
   - Fill in app name, support email, and authorized domains.
4. **OAuth 2.0 Credentials** — Create under APIs & Services > Credentials:
   - Click **Create Credentials > OAuth client ID**.
   - Application type: **Web application**.
   - Add **Authorized redirect URI**:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/google
     ```
   - Note the **Client ID** and **Client Secret**.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `google-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'given_name' in claims then 'first' else null]: claims.given_name,
           [if 'family_name' in claims then 'last' else null]: claims.family_name,
         },
         [if 'picture' in claims then 'picture' else null]: claims.picture,
       },
     },
   }
   ```

2. **Add Google as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "google",
       "provider": "google",
       "client_id": "<your-google-client-id>",
       "client_secret": "<your-google-client-secret>",
       "scope": ["openid", "profile", "email"],
       "mapper_url": "base64://'"$(base64 < google-mapper.jsonnet)"'"
     }'
   ```

3. **Enable the OIDC method:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/enabled=true'
   ```

## Technical Details

### OIDC Configuration

| Parameter | Value |
|-----------|-------|
| Provider Type | `google` (native support) |
| Issuer URL | `https://accounts.google.com` |
| Authorization URL | `https://accounts.google.com/o/oauth2/v2/auth` |
| Token URL | `https://oauth2.googleapis.com/token` |
| Userinfo URL | `https://openidconnect.googleapis.com/v1/userinfo` |
| JWKS URL | `https://www.googleapis.com/oauth2/v3/certs` |
| Discovery URL | `https://accounts.google.com/.well-known/openid-configuration` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `openid` | OIDC ID token |
| `profile` | Name, picture, locale |
| `email` | Email address and email_verified |

### Claims from Google

| Claim | Description |
|-------|-------------|
| `sub` | Unique Google account ID |
| `email` | Email address |
| `email_verified` | Whether email is verified (always `true` for Google) |
| `name` | Full name |
| `given_name` | First name |
| `family_name` | Last name |
| `picture` | Profile picture URL |
| `locale` | User's locale |
| `hd` | Hosted domain (for Google Workspace accounts) |

### FedCM Support

Google supports the FedCM API, which provides a browser-native credential selection UI without cross-site redirects. Ory Kratos supports FedCM when available in the browser.

### Google Workspace (hd claim)

For applications restricted to specific Google Workspace domains, use the `hd` (hosted domain) claim to verify the user's organization:

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      email: claims.email,
      name: {
        first: claims.given_name,
        last: claims.family_name,
      },
      [if 'hd' in claims then 'organization' else null]: claims.hd,
    },
  },
}
```

## Example Identity Schema

### Jsonnet Claims Mapper (`google-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'given_name' in claims then 'first' else null]: claims.given_name,
        [if 'family_name' in claims then 'last' else null]: claims.family_name,
      },
      [if 'picture' in claims then 'picture' else null]: claims.picture,
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with a Google account.
2. **Test with Google Workspace account** to verify the `hd` claim.
3. **Test One Tap / FedCM** by enabling it in Google Cloud Console.
4. **Verify identity creation** with email, name, and picture.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos Google Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/google)
- [Google Identity - OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Google FedCM Integration](https://developers.google.com/identity/gsi/web/guides/fedcm-migration)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
