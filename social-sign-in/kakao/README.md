# Kakao Login - Ory Network Integration

> **Status: Community/Proposed** — This integration does not have official Ory documentation yet. Kakao supports standard OIDC, making it straightforward to integrate.

## Overview

Kakao is South Korea's dominant internet platform, with KakaoTalk used by over 90% of the South Korean population (53+ million users). Kakao Login provides OAuth 2.0 and OIDC authentication, making it essential for any application targeting the South Korean market. Kakao provides rich user profile data including KakaoTalk profile, email, gender, age range, and more.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "kakao" provider)
       |
       v
  Kakao Authorization Endpoint
  (https://kauth.kakao.com/oauth/authorize)
       |
       v
  Kakao Login (Web or KakaoTalk App)
       |
       v
  Kakao Token Endpoint
  (https://kauth.kakao.com/oauth/token)
       |
       v
  Kakao User Info API
  (https://kapi.kakao.com/v2/user/me)
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
2. **Kakao Developer Account** — Register at [developers.kakao.com](https://developers.kakao.com/).
3. **Kakao Application** — Create at the Kakao Developer Console:
   - Go to **My Applications > Add Application**.
   - Under **Kakao Login**, enable the login feature.
   - Add the **Redirect URI**:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/kakao
     ```
   - Under **Kakao Login > Consent Items**, configure required user data:
     - Email (requires approval for production)
     - Profile (nickname, profile image)
   - Note the **REST API Key** (Client ID) from **App Keys**.
   - Under **Security**, generate a **Client Secret** and set it to "Enable".
4. **OpenID Connect Activation** — Under **Kakao Login > OpenID Connect**, enable OIDC.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `kakao-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'nickname' in claims then 'full' else null]: claims.nickname,
         },
         [if 'picture' in claims then 'picture' else null]: claims.picture,
       },
     },
   }
   ```

2. **Add Kakao as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "kakao",
       "provider": "generic",
       "client_id": "<your-kakao-rest-api-key>",
       "client_secret": "<your-kakao-client-secret>",
       "issuer_url": "https://kauth.kakao.com",
       "authorization_url": "https://kauth.kakao.com/oauth/authorize",
       "token_url": "https://kauth.kakao.com/oauth/token",
       "scope": ["openid", "profile_nickname", "profile_image", "account_email"],
       "mapper_url": "base64://'"$(base64 < kakao-mapper.jsonnet)"'"
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
| Issuer URL | `https://kauth.kakao.com` |
| Authorization URL | `https://kauth.kakao.com/oauth/authorize` |
| Token URL | `https://kauth.kakao.com/oauth/token` |
| Userinfo URL | `https://kapi.kakao.com/v2/user/me` |
| JWKS URL | `https://kauth.kakao.com/.well-known/jwks.json` |
| Discovery URL | `https://kauth.kakao.com/.well-known/openid-configuration` |

### Available Scopes

| Scope | Description | Consent Required |
|-------|-------------|-----------------|
| `openid` | OIDC ID token | No |
| `profile_nickname` | KakaoTalk nickname | Yes |
| `profile_image` | Profile image URL | Yes |
| `account_email` | Email address | Yes (review required for production) |
| `gender` | Gender | Yes |
| `age_range` | Age range | Yes |
| `birthday` | Birthday (MMDD) | Yes |
| `phone_number` | Phone number | Yes (review required) |

### Claims from Kakao (OIDC ID Token)

| Claim | Description |
|-------|-------------|
| `sub` | Unique Kakao user ID |
| `nickname` | KakaoTalk nickname |
| `picture` | Profile image URL |
| `email` | Email address |
| `email_verified` | Whether email is verified |
| `gender` | Gender |
| `birthday` | Birthday |
| `phone_number` | Phone number |

### Important Considerations

- **Email requires app review:** To access email in production, your app must be reviewed by Kakao.
- **KakaoTalk profile vs Kakao account:** Users may have different profiles for KakaoTalk and their Kakao account. The `profile_nickname` and `profile_image` scopes return the KakaoTalk profile.
- **Client ID is REST API Key:** Kakao provides multiple app keys; use the **REST API Key** as the OAuth client ID.
- **Korean market essential:** Kakao Login is effectively mandatory for apps targeting South Korean users.

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
            "full": { "type": "string", "title": "Nickname" }
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

### Jsonnet Claims Mapper (`kakao-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'nickname' in claims then 'full' else null]: claims.nickname,
      },
      [if 'picture' in claims then 'picture' else null]: claims.picture,
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with a Kakao account.
2. **Test with KakaoTalk app installed** — the flow may redirect to the KakaoTalk app on mobile.
3. **Verify email consent** — ensure the email consent item is properly configured.
4. **Test in development mode** — Kakao allows testing without app review for registered team members.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Kakao Login Documentation](https://developers.kakao.com/docs/latest/en/kakaologin/common)
- [Kakao OIDC Documentation](https://developers.kakao.com/docs/latest/en/kakaologin/rest-api#oidc)
- [Kakao User API](https://developers.kakao.com/docs/latest/en/kakaologin/rest-api#req-user-info)
- [Kakao OpenID Connect Discovery](https://kauth.kakao.com/.well-known/openid-configuration)
- [Ory Kratos Social Sign-In Overview](https://www.ory.sh/docs/kratos/social-signin/overview)
- [Ory Kratos Generic Provider Configuration](https://www.ory.sh/docs/kratos/social-signin/generic)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
