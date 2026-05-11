# Log in with Spotify - Ory Network Integration

## Overview

Spotify is the world's most popular music streaming platform with over 600 million users. Integrating Spotify Login with Ory Network enables entertainment apps, music-related platforms, and social applications to authenticate users via their Spotify accounts. Spotify's OAuth2 flow can also provide access to music preferences and listening data for personalization.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "spotify" provider)
       |
       v
  Spotify Authorization Endpoint
  (https://accounts.spotify.com/authorize)
       |
       v
  Spotify Login & Consent
       |
       v
  Spotify Token Endpoint
  (https://accounts.spotify.com/api/token)
       |
       v
  Spotify User Profile API
  (https://api.spotify.com/v1/me)
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
| **Ory Kratos** | Identity management, built-in Spotify provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **Spotify Developer Account** — Register at [developer.spotify.com](https://developer.spotify.com/).
3. **Spotify App** — Create in the Spotify Developer Dashboard:
   - Click **Create an App**.
   - Add the **Redirect URI**:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/spotify
     ```
   - Note the **Client ID** and **Client Secret**.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `spotify-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'display_name' in claims then 'full' else null]: claims.display_name,
         },
       },
     },
   }
   ```

2. **Add Spotify as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "spotify",
       "provider": "spotify",
       "client_id": "<your-spotify-client-id>",
       "client_secret": "<your-spotify-client-secret>",
       "scope": ["user-read-email", "user-read-private"],
       "mapper_url": "base64://'"$(base64 < spotify-mapper.jsonnet)"'"
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
| Provider Type | `spotify` (native support) |
| Authorization URL | `https://accounts.spotify.com/authorize` |
| Token URL | `https://accounts.spotify.com/api/token` |
| User Info URL | `https://api.spotify.com/v1/me` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `user-read-email` | Email address |
| `user-read-private` | Subscription details, country, display name |
| `user-read-playback-state` | Current playback state |
| `user-library-read` | Saved tracks/albums |
| `playlist-read-private` | Private playlists |

### Claims from Spotify

| Spotify Field | Description |
|--------------|-------------|
| `id` | Unique Spotify user ID |
| `email` | Email address |
| `display_name` | Display name |
| `images` | Profile images array |
| `country` | Country code |
| `product` | Subscription type (free, premium) |

## Example Identity Schema

### Jsonnet Claims Mapper (`spotify-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'display_name' in claims then 'full' else null]: claims.display_name,
      },
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with a Spotify account.
2. **Verify identity creation** with email and display name.
3. **Test with free and premium accounts** to verify different claim availability.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos Spotify Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/spotify)
- [Spotify Web API Authorization Guide](https://developer.spotify.com/documentation/web-api/concepts/authorization)
- [Spotify Authorization Code Flow](https://developer.spotify.com/documentation/web-api/tutorials/code-flow)
- [Spotify User Profile API](https://developer.spotify.com/documentation/web-api/reference/get-current-users-profile)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
