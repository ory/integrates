# Epic Games Login - Ory Network Integration

> **Status: Community/Proposed** — This integration does not have official Ory documentation yet. Epic Games supports standard OAuth 2.0, making it possible to integrate as a generic provider.

## Overview

Epic Games is a major gaming platform with over 230 million Epic Games Store accounts and is the creator of Unreal Engine and Fortnite. Epic Games Login enables gaming platforms, game launchers, modding communities, and esports applications to authenticate users with their Epic Games accounts.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "epic-games" provider)
       |
       v
  Epic Games Authorization Endpoint
  (https://www.epicgames.com/id/authorize)
       |
       v
  Epic Games Login
       |
       v
  Epic Games Token Endpoint
  (https://api.epicgames.dev/epic/oauth/v2/token)
       |
       v
  Epic Games User Info API
  (https://api.epicgames.dev/epic/oauth/v2/userInfo)
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
| **Ory Kratos** | Identity management, generic OIDC provider strategy |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **Epic Games Developer Account** — Register at [dev.epicgames.com](https://dev.epicgames.com/).
3. **Epic Games Application** — Create in the Epic Games Developer Portal:
   - Go to your product/organization settings.
   - Under **Product Settings > Clients**, create a new client.
   - Set **Client Type** to **Web**.
   - Add the **Redirect URI**:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/epic-games
     ```
   - Note the **Client ID** and **Client Secret**.
   - Configure the required **permissions/scopes**.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `epic-games-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'preferred_username' in claims then 'full' else null]: claims.preferred_username,
         },
       },
     },
   }
   ```

2. **Add Epic Games as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "epic-games",
       "provider": "generic",
       "client_id": "<your-epic-client-id>",
       "client_secret": "<your-epic-client-secret>",
       "authorization_url": "https://www.epicgames.com/id/authorize",
       "token_url": "https://api.epicgames.dev/epic/oauth/v2/token",
       "issuer_url": "https://api.epicgames.dev/epic/oauth/v2",
       "scope": ["basic_profile", "email_address"],
       "mapper_url": "base64://'"$(base64 < epic-games-mapper.jsonnet)"'"
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
| Provider Type | `generic` (OAuth 2.0) |
| Authorization URL | `https://www.epicgames.com/id/authorize` |
| Token URL | `https://api.epicgames.dev/epic/oauth/v2/token` |
| User Info URL | `https://api.epicgames.dev/epic/oauth/v2/userInfo` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `basic_profile` | Display name and account ID |
| `email_address` | Email address |
| `friends_list` | Friends list |
| `presence` | Online presence status |

### Claims from Epic Games

| Epic Games Field | Description |
|-----------------|-------------|
| `sub` | Epic Games account ID |
| `preferred_username` | Display name |
| `email` | Email address |
| `email_verified` | Whether email is verified |

### Important Considerations

- **Epic Games Developer Portal access:** You need to be part of an organization in the Epic Games Developer Portal to create OAuth clients.
- **Epic Online Services (EOS):** Epic's authentication is part of the broader Epic Online Services ecosystem.
- **Client authentication:** Epic may require HTTP Basic authentication for the token endpoint (client_id:client_secret as Base64 in Authorization header).
- **Gaming-specific data:** Additional Epic Games APIs can provide game-specific data, achievements, and social features.

## Example Identity Schema

### Ory Identity Schema (`identity.schema.json`)

```json
{
  "$id": "https://example.com/identity.schema.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Identity",
  "type": "object",
  "properties": {
    "traits": {
      "type": "object",
      "properties": {
        "email": {
          "type": "string",
          "format": "email",
          "title": "Email",
          "ory.sh/kratos": {
            "credentials": {
              "password": { "identifier": true }
            },
            "verification": { "via": "email" }
          }
        },
        "name": {
          "type": "object",
          "properties": {
            "full": { "type": "string", "title": "Display Name" }
          }
        }
      },
      "required": ["email"]
    }
  }
}
```

### Jsonnet Claims Mapper (`epic-games-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'preferred_username' in claims then 'full' else null]: claims.preferred_username,
      },
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with an Epic Games account.
2. **Verify identity creation** with email and display name.
3. **Test with accounts linked to different platforms** (PlayStation, Xbox, Nintendo) to verify that Epic Games provides a consistent identity.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Epic Games Developer Portal](https://dev.epicgames.com/)
- [Epic Online Services Documentation](https://dev.epicgames.com/docs/epic-online-services)
- [Epic Account Services - Auth Interface](https://dev.epicgames.com/docs/epic-account-services/auth/auth-interface)
- [Epic Games OAuth 2.0](https://dev.epicgames.com/docs/web-api-ref/authentication)
- [Ory Kratos Social Sign-In Overview](https://www.ory.sh/docs/kratos/social-signin/overview)
- [Ory Kratos Generic Provider Configuration](https://www.ory.sh/docs/kratos/social-signin/generic)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
