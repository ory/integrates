# Sign in with X (Twitter) - Ory Network Integration

## Overview

X (formerly Twitter) is a major social media platform with hundreds of millions of active users. X provides OAuth 2.0 authentication (with PKCE) for user sign-in. Integrating X with Ory Network enables social applications, media platforms, and community tools to authenticate users via their X accounts.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "x" provider)
       |
       v
  X Authorization Endpoint
  (https://twitter.com/i/oauth2/authorize)
       |
       v
  X Login & Consent
       |
       v
  X Token Endpoint
  (https://api.twitter.com/2/oauth2/token)
       |
       v
  X Users API
  (https://api.twitter.com/2/users/me)
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
| **Ory Kratos** | Identity management, built-in X/Twitter provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **X Developer Account** — Apply at [developer.x.com](https://developer.x.com/).
3. **X App** — Create in the X Developer Portal:
   - Create a **Project** and an **App** within it.
   - Under **User authentication settings**, enable **OAuth 2.0**.
   - Set **Type of App** to **Web App**.
   - Set **Callback URL**:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/x-twitter
     ```
   - Note the **Client ID** and **Client Secret**.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `x-twitter-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'name' in claims then 'full' else null]: claims.name,
         },
         [if 'username' in claims then 'username' else null]: claims.username,
         [if 'profile_image_url' in claims then 'picture' else null]: claims.profile_image_url,
       },
     },
   }
   ```

2. **Add X as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "x-twitter",
       "provider": "generic",
       "client_id": "<your-x-client-id>",
       "client_secret": "<your-x-client-secret>",
       "authorization_url": "https://twitter.com/i/oauth2/authorize",
       "token_url": "https://api.twitter.com/2/oauth2/token",
       "scope": ["users.read", "tweet.read", "offline.access"],
       "mapper_url": "base64://'"$(base64 < x-twitter-mapper.jsonnet)"'"
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

### OAuth 2.0 Configuration

| Parameter | Value |
|-----------|-------|
| Provider Type | `generic` (OAuth 2.0 with PKCE) |
| Authorization URL | `https://twitter.com/i/oauth2/authorize` |
| Token URL | `https://api.twitter.com/2/oauth2/token` |
| User Info URL | `https://api.twitter.com/2/users/me` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `users.read` | Read user profile information |
| `tweet.read` | Read tweets (required for basic access) |
| `offline.access` | Refresh token |

### Claims from X

| X Field | Description |
|---------|-------------|
| `id` | Unique X user ID |
| `name` | Display name |
| `username` | @handle |
| `profile_image_url` | Profile picture URL |
| `description` | Bio |
| `verified` | Whether account is verified |

### Important Considerations

- **PKCE required:** X OAuth 2.0 requires PKCE (Proof Key for Code Exchange). Ory Kratos handles this automatically.
- **Email not available via OAuth 2.0:** X's v2 API OAuth 2.0 does not provide user email addresses. You may need to use the v1.1 OAuth 1.0a flow for email access, or make email optional in your schema.
- **API access tiers:** X has Free, Basic, Pro, and Enterprise API tiers with different rate limits and capabilities.
- **`tweet.read` scope required:** X requires `tweet.read` even for basic user profile access.

## Example Identity Schema

### Jsonnet Claims Mapper (`x-twitter-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      // Email may not be available via X OAuth 2.0
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'name' in claims then 'full' else null]: claims.name,
      },
      [if 'username' in claims then 'username' else null]: claims.username,
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with an X account.
2. **Note that email may not be available** — adjust your identity schema accordingly.
3. **Verify identity creation** with display name and username.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos X/Twitter Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/x-twitter)
- [X API v2 Authentication](https://developer.x.com/en/docs/authentication/oauth-2-0)
- [X API v2 Users Endpoint](https://developer.x.com/en/docs/twitter-api/users/lookup/api-reference)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
