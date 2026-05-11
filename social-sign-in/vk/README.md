# VKontakte (VK) Social Sign-In - Ory Network Integration

## Overview

VKontakte (VK) is the largest social network in Russia and the CIS region, with over 100 million monthly active users. Integrating VK with Ory Network is essential for applications targeting the Russian-speaking market. VK provides OAuth 2.0 authentication with access to user profiles, friends lists, and social graph data.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "vk" provider)
       |
       v
  VK Authorization Endpoint
  (https://id.vk.com/authorize)
       |
       v
  VK Login & Consent
       |
       v
  VK Token Endpoint
  (https://id.vk.com/oauth2/auth)
       |
       v
  VK API - User Profile
  (https://api.vk.com/method/users.get)
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
| **Ory Kratos** | Identity management, built-in VK provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **VK Developer Account** — Register at [vk.com/dev](https://vk.com/dev).
3. **VK Application** — Create at [vk.com/apps?act=manage](https://vk.com/apps?act=manage):
   - Click **Create**.
   - Select **Website** platform.
   - Set **Redirect URI**:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/vk
     ```
   - Note the **App ID** (Client ID) and **Secure key** (Client Secret).

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `vk-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'first_name' in claims then 'first' else null]: claims.first_name,
           [if 'last_name' in claims then 'last' else null]: claims.last_name,
         },
       },
     },
   }
   ```

2. **Add VK as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "vk",
       "provider": "vk",
       "client_id": "<your-vk-app-id>",
       "client_secret": "<your-vk-secure-key>",
       "scope": ["email"],
       "mapper_url": "base64://'"$(base64 < vk-mapper.jsonnet)"'"
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
| Provider Type | `vk` (native support) |
| Authorization URL | `https://id.vk.com/authorize` |
| Token URL | `https://id.vk.com/oauth2/auth` |
| User Info URL | `https://api.vk.com/method/users.get` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `email` | User's email address |
| `phone` | Phone number |
| `vkid.personal_info` | Basic profile info |

### Claims from VK

| VK Field | Description |
|----------|-------------|
| `id` | Unique VK user ID |
| `email` | Email address |
| `first_name` | First name |
| `last_name` | Last name |
| `photo_200` | Profile photo URL (200px) |
| `screen_name` | VK username/screen name |
| `bdate` | Birth date |
| `city` | City |
| `country` | Country |

### Important Considerations

- **VK ID platform:** VK has migrated to VK ID (id.vk.com) as the primary authentication platform.
- **Email may be absent:** Not all VK accounts have an associated email. Consider making email optional in your identity schema.
- **Phone-based accounts:** Many VK users register with phone numbers rather than email.

## Example Identity Schema

### Jsonnet Claims Mapper (`vk-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'first_name' in claims then 'first' else null]: claims.first_name,
        [if 'last_name' in claims then 'last' else null]: claims.last_name,
      },
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with a VK account.
2. **Test with email and phone-only accounts** to verify handling.
3. **Verify identity creation** with correct name and email.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos VK Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/vk)
- [VK ID Documentation](https://id.vk.com/about/business/go/docs/en/vkid/latest/vk-id/intro/start-page)
- [VK API Documentation](https://dev.vk.com/en)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
