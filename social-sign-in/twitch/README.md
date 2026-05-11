# Log in with Twitch - Ory Network Integration

## Overview

Twitch is the world's leading live streaming platform with over 140 million monthly active users, primarily focused on gaming, esports, and creative content. Integrating Twitch with Ory Network enables gaming platforms, streaming tools, community applications, and esports platforms to authenticate users with their Twitch accounts.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "twitch" provider)
       |
       v
  Twitch Authorization Endpoint
  (https://id.twitch.tv/oauth2/authorize)
       |
       v
  Twitch Login & Consent
       |
       v
  Twitch Token Endpoint
  (https://id.twitch.tv/oauth2/token)
       |
       v
  Twitch Userinfo / Users API
  (https://id.twitch.tv/oauth2/userinfo)
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
| **Ory Kratos** | Identity management, built-in Twitch provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **Twitch Developer Account** — Register at [dev.twitch.tv](https://dev.twitch.tv/).
3. **Twitch Application** — Create in the Twitch Developer Console:
   - Go to **Console > Applications > Register Your Application**.
   - Set **OAuth Redirect URL**:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/twitch
     ```
   - Set **Category** to your application type.
   - Note the **Client ID** and generate a **Client Secret**.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `twitch-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'preferred_username' in claims then 'full' else null]: claims.preferred_username,
         },
         [if 'picture' in claims then 'picture' else null]: claims.picture,
       },
     },
   }
   ```

2. **Add Twitch as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "twitch",
       "provider": "generic",
       "client_id": "<your-twitch-client-id>",
       "client_secret": "<your-twitch-client-secret>",
       "issuer_url": "https://id.twitch.tv/oauth2",
       "scope": ["openid", "user:read:email"],
       "mapper_url": "base64://'"$(base64 < twitch-mapper.jsonnet)"'"
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
| Provider Type | `generic` (OIDC-compliant) |
| Issuer URL | `https://id.twitch.tv/oauth2` |
| Authorization URL | `https://id.twitch.tv/oauth2/authorize` |
| Token URL | `https://id.twitch.tv/oauth2/token` |
| Userinfo URL | `https://id.twitch.tv/oauth2/userinfo` |
| JWKS URL | `https://id.twitch.tv/oauth2/keys` |
| Discovery URL | `https://id.twitch.tv/oauth2/.well-known/openid-configuration` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `openid` | OIDC ID token |
| `user:read:email` | User's email address |
| `channel:read:subscriptions` | Channel subscription info |

### Claims from Twitch

| Claim | Description |
|-------|-------------|
| `sub` | Unique Twitch user ID |
| `email` | Email address |
| `email_verified` | Whether email is verified |
| `preferred_username` | Twitch display name |
| `picture` | Profile image URL |

## Example Identity Schema

### Jsonnet Claims Mapper (`twitch-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'preferred_username' in claims then 'full' else null]: claims.preferred_username,
      },
      [if 'picture' in claims then 'picture' else null]: claims.picture,
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with a Twitch account.
2. **Verify identity creation** with email and Twitch username.
3. **Test 2FA enforcement** — Twitch accounts often have 2FA enabled.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos Twitch Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/twitch)
- [Twitch Authentication Guide](https://dev.twitch.tv/docs/authentication/)
- [Twitch OIDC Discovery](https://id.twitch.tv/oauth2/.well-known/openid-configuration)
- [Twitch API Reference](https://dev.twitch.tv/docs/api/reference/)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
