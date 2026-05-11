# Naver Login - Ory Network Integration

> **Status: Community/Proposed** — This integration does not have official Ory documentation yet. Naver uses standard OAuth 2.0, making it straightforward to integrate as a generic provider.

## Overview

Naver is South Korea's largest web portal and search engine, with Naver Login used by hundreds of millions of accounts. Together with Kakao, Naver Login is one of the two most important social login providers for the South Korean market. Naver provides rich profile data including email, name, age, gender, and profile image.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "naver" provider)
       |
       v
  Naver Authorization Endpoint
  (https://nid.naver.com/oauth2.0/authorize)
       |
       v
  Naver Login
       |
       v
  Naver Token Endpoint
  (https://nid.naver.com/oauth2.0/token)
       |
       v
  Naver Profile API
  (https://openapi.naver.com/v1/nid/me)
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
| **Ory Kratos** | Identity management, generic OAuth2 provider strategy |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **Naver Developer Account** — Register at [developers.naver.com](https://developers.naver.com/).
3. **Naver Application** — Create at the Naver Developer Center:
   - Go to **Application > Register Application**.
   - Select **Naver Login** as the API.
   - Select required permissions: **Profile**, **Email**, **Name**.
   - Add the **Callback URL**:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/naver
     ```
   - Note the **Client ID** and **Client Secret**.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `naver-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   // Naver wraps profile data in a "response" object
   local profile = if 'response' in claims then claims.response else claims;

   {
     identity: {
       traits: {
         [if 'email' in profile then 'email' else null]: profile.email,
         name: {
           [if 'name' in profile then 'full' else null]: profile.name,
           [if 'nickname' in profile then 'nickname' else null]: profile.nickname,
         },
         [if 'profile_image' in profile then 'picture' else null]: profile.profile_image,
       },
     },
   }
   ```

2. **Add Naver as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "naver",
       "provider": "generic",
       "client_id": "<your-naver-client-id>",
       "client_secret": "<your-naver-client-secret>",
       "authorization_url": "https://nid.naver.com/oauth2.0/authorize",
       "token_url": "https://nid.naver.com/oauth2.0/token",
       "scope": [],
       "mapper_url": "base64://'"$(base64 < naver-mapper.jsonnet)"'"
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
| Authorization URL | `https://nid.naver.com/oauth2.0/authorize` |
| Token URL | `https://nid.naver.com/oauth2.0/token` |
| User Info URL | `https://openapi.naver.com/v1/nid/me` |

### Scopes

Naver does not use granular scopes in the OAuth flow. Instead, permissions are configured at the application level in the Naver Developer Console. The available profile fields depend on which permissions are enabled for the application.

### Claims from Naver Profile API

The Naver Profile API returns data wrapped in a `response` object:

```json
{
  "resultcode": "00",
  "message": "success",
  "response": {
    "id": "unique-naver-id",
    "email": "user@example.com",
    "name": "User Name",
    "nickname": "nick",
    "profile_image": "https://...",
    "age": "20-29",
    "gender": "M",
    "birthday": "01-01",
    "birthyear": "1990",
    "mobile": "010-1234-5678"
  }
}
```

| Naver Field | Description | Permission Required |
|------------|-------------|-------------------|
| `id` | Unique Naver user ID | Always |
| `email` | Email address | Email |
| `name` | Real name | Name |
| `nickname` | Naver nickname | Profile |
| `profile_image` | Profile picture URL | Profile |
| `age` | Age range (e.g., "20-29") | Age |
| `gender` | Gender (M/F) | Gender |
| `birthday` | Birthday (MM-DD) | Birthday |
| `birthyear` | Birth year | Birthyear |
| `mobile` | Mobile phone number | Mobile |

### Important Considerations

- **Korean market focus:** Naver Login is primarily used in South Korea.
- **No OIDC support:** Naver uses plain OAuth 2.0, not OIDC. There is no ID token; all profile data comes from the userinfo API.
- **Nested response:** Profile data is nested under the `response` key in the API response. The Jsonnet mapper must handle this.
- **Permission-based fields:** Available profile fields depend on which permissions are enabled for your app in the Naver Developer Console.
- **App review required:** For production use, Naver requires app review for certain permissions.

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
            "full": { "type": "string", "title": "Name" },
            "nickname": { "type": "string", "title": "Nickname" }
          }
        },
        "picture": {
          "type": "string",
          "title": "Profile Picture URL"
        }
      },
      "required": ["email"]
    }
  }
}
```

### Jsonnet Claims Mapper (`naver-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

local profile = if 'response' in claims then claims.response else claims;

{
  identity: {
    traits: {
      [if 'email' in profile then 'email' else null]: profile.email,
      name: {
        [if 'name' in profile then 'full' else null]: profile.name,
        [if 'nickname' in profile then 'nickname' else null]: profile.nickname,
      },
      [if 'profile_image' in profile then 'picture' else null]: profile.profile_image,
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with a Naver account.
2. **Verify identity creation** with email, name, and profile image.
3. **Test from South Korea** or with a Naver account that has Korean locale settings.
4. **Check the nested response** — ensure the Jsonnet mapper correctly handles the `response` wrapper.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Naver Login Developer Guide](https://developers.naver.com/docs/login/overview/overview.md)
- [Naver Login API Reference](https://developers.naver.com/docs/login/api/api.md)
- [Naver Profile API](https://developers.naver.com/docs/login/profile/profile.md)
- [Naver Developer Center](https://developers.naver.com/)
- [Ory Kratos Social Sign-In Overview](https://www.ory.sh/docs/kratos/social-signin/overview)
- [Ory Kratos Generic Provider Configuration](https://www.ory.sh/docs/kratos/social-signin/generic)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
