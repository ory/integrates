# Discord Social Sign-In - Ory Network Integration

## Overview

Discord is a popular communication platform with over 150 million monthly active users, widely used in gaming, community, and creative spaces. Integrating Discord with Ory Network enables applications to authenticate users with their Discord accounts, access guild (server) membership information, and build community-driven authentication flows.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "discord" provider)
       |
       v
  Discord Authorization Endpoint
  (https://discord.com/oauth2/authorize)
       |
       v
  Discord User Authentication & Consent
       |
       v
  Discord Token Endpoint
  (https://discord.com/api/oauth2/token)
       |
       v
  Discord User API
  (https://discord.com/api/users/@me)
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
| **Ory Kratos** | Identity management, built-in Discord provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **Discord Developer Account** — Register at [discord.com/developers](https://discord.com/developers/applications).
3. **Discord Application** — Create a new application:
   - Go to the **Discord Developer Portal**.
   - Click **New Application** and provide a name.
   - Navigate to the **OAuth2** section.
   - Note the **Client ID** and **Client Secret**.
4. **Configure Redirect URI** — In the OAuth2 settings, add the Ory callback URL:
   ```
   https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/discord
   ```

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `discord-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'global_name' in claims then 'full' else null]: claims.global_name,
         },
         [if 'username' in claims then 'username' else null]: claims.username,
         [if 'avatar' in claims && 'id' in claims then 'picture' else null]:
           'https://cdn.discordapp.com/avatars/' + claims.id + '/' + claims.avatar + '.png',
       },
     },
   }
   ```

2. **Add Discord as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "discord",
       "provider": "discord",
       "client_id": "<your-discord-client-id>",
       "client_secret": "<your-discord-client-secret>",
       "scope": ["identify", "email"],
       "mapper_url": "base64://'"$(base64 < discord-mapper.jsonnet)"'"
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
| Provider Type | `discord` (native support) |
| Authorization URL | `https://discord.com/oauth2/authorize` |
| Token URL | `https://discord.com/api/oauth2/token` |
| User Info URL | `https://discord.com/api/users/@me` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `identify` | User's ID, username, avatar, discriminator, flags |
| `email` | User's email address |
| `guilds` | List of guilds the user is a member of |
| `guilds.members.read` | Member info for guilds the user is in |
| `connections` | User's third-party connections |

### Claims from Discord

| Discord Field | Description |
|--------------|-------------|
| `id` | Unique Discord user ID (snowflake) |
| `username` | Username |
| `global_name` | Display name |
| `email` | Email address (requires `email` scope) |
| `verified` | Whether email is verified |
| `avatar` | Avatar hash |
| `discriminator` | Legacy discriminator (deprecated) |
| `locale` | User's locale |
| `mfa_enabled` | Whether 2FA is enabled |

## Example Identity Schema

### Jsonnet Claims Mapper (`discord-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'global_name' in claims then 'full' else null]: claims.global_name,
      },
      [if 'username' in claims then 'username' else null]: claims.username,
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with a Discord account.
2. **Verify the identity** contains correct email and display name.
3. **Test with unverified email** — Discord allows unverified emails; handle accordingly.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos Discord Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/discord)
- [Discord Developer Documentation](https://discord.com/developers/docs)
- [Discord OAuth2 Reference](https://discord.com/developers/docs/topics/oauth2)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
