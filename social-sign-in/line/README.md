# LINE Login - Ory Network Integration

## Overview

LINE is the dominant messaging platform in Japan, Thailand, Taiwan, and Indonesia with over 200 million monthly active users. LINE Login provides OIDC-compliant authentication, making it essential for consumer applications targeting these markets. LINE Login can also provide access to the LINE Messaging API for sending notifications.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "line" provider)
       |
       v
  LINE Authorization Endpoint
  (https://access.line.me/oauth2/v2.1/authorize)
       |
       v
  LINE Login
       |
       v
  LINE Token Endpoint
  (https://api.line.me/oauth2/v2.1/token)
       |
       v
  LINE Profile API
  (https://api.line.me/v2/profile)
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
| **Ory Kratos** | Identity management, built-in LINE provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **LINE Developer Account** — Register at [developers.line.biz](https://developers.line.biz/).
3. **LINE Login Channel** — Create in the LINE Developers Console:
   - Create a **Provider** (if you don't have one).
   - Create a **LINE Login** channel.
   - Note the **Channel ID** (Client ID) and **Channel Secret** (Client Secret).
   - Add the **Callback URL**:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/line
     ```
   - Enable **Email address permission** in the channel settings.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `line-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'name' in claims then 'full' else null]: claims.name,
         },
         [if 'picture' in claims then 'picture' else null]: claims.picture,
       },
     },
   }
   ```

2. **Add LINE as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "line",
       "provider": "generic",
       "client_id": "<your-line-channel-id>",
       "client_secret": "<your-line-channel-secret>",
       "issuer_url": "https://access.line.me",
       "authorization_url": "https://access.line.me/oauth2/v2.1/authorize",
       "token_url": "https://api.line.me/oauth2/v2.1/token",
       "scope": ["openid", "profile", "email"],
       "mapper_url": "base64://'"$(base64 < line-mapper.jsonnet)"'"
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
| Issuer URL | `https://access.line.me` |
| Authorization URL | `https://access.line.me/oauth2/v2.1/authorize` |
| Token URL | `https://api.line.me/oauth2/v2.1/token` |
| Userinfo URL | `https://api.line.me/v2/profile` |
| JWKS URL | `https://api.line.me/oauth2/v2.1/certs` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `openid` | OIDC ID token |
| `profile` | Display name and profile picture |
| `email` | Email address (requires permission approval) |

### Claims from LINE

| Claim | Description |
|-------|-------------|
| `sub` | Unique LINE user ID |
| `name` | Display name |
| `picture` | Profile picture URL |
| `email` | Email address (if `email` scope approved) |

### Important Considerations

- **Email permission requires approval:** You must apply for email address permission in the LINE Developers Console. It is not automatically available.
- **Display name only:** LINE provides a single display name, not separate first/last names.
- **LINE user IDs are channel-scoped:** The `sub` claim is unique per channel, not globally.

## Example Identity Schema

### Jsonnet Claims Mapper (`line-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'name' in claims then 'full' else null]: claims.name,
      },
      [if 'picture' in claims then 'picture' else null]: claims.picture,
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with a LINE account.
2. **Verify identity creation** with display name and email (if approved).
3. **Test on mobile** — LINE Login often redirects to the LINE app on mobile devices.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos LINE Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/line)
- [LINE Login Documentation](https://developers.line.biz/en/docs/line-login/)
- [LINE Login v2.1 API Reference](https://developers.line.biz/en/reference/line-login/)
- [LINE OIDC Discovery](https://access.line.me/.well-known/openid-configuration)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
