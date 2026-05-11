# WeChat Login - Ory Network Integration

> **Status: Community/Proposed** — This integration does not have official Ory documentation. WeChat uses a non-standard OAuth flow that requires special handling.

## Overview

WeChat is China's dominant super-app with over 1.3 billion monthly active users. WeChat Login is essential for any application targeting the Chinese market. Unlike standard OAuth 2.0, WeChat uses a proprietary protocol with `appid` instead of `client_id` and has distinct flows for web, mobile, and WeChat Mini Program authentication.

## Integration Architecture

```
User Browser / WeChat App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "wechat" provider)
       |
       v
  WeChat Authorization Endpoint
  Web: https://open.weixin.qq.com/connect/qrconnect
  Mobile: https://open.weixin.qq.com/connect/oauth2/authorize
       |
       v
  WeChat QR Code Scan (Web) / In-App Auth (Mobile)
       |
       v
  WeChat Token Endpoint
  (https://api.weixin.qq.com/sns/oauth2/access_token)
       |
       v
  WeChat User Info API
  (https://api.weixin.qq.com/sns/userinfo)
       |
       v
  Ory Kratos creates/updates identity
       |
       v
  User redirected to application
```

**WeChat-Specific Differences from Standard OAuth:**

| Standard OAuth 2.0 | WeChat Equivalent |
|-------------------|-------------------|
| `client_id` | `appid` |
| `client_secret` | `secret` |
| `redirect_uri` | `redirect_uri` |
| `response_type=code` | `response_type=code` |
| Standard token endpoint | Custom endpoint with `appid` and `secret` as query params |

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management, generic OIDC strategy with custom config |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **WeChat Open Platform Account** — Register at [open.weixin.qq.com](https://open.weixin.qq.com/):
   - Requires a Chinese business entity or authorized agent.
   - Complete developer verification.
3. **WeChat Application** — Create a web or mobile application:
   - For web: Create a **Website Application** (requires ICP filing for Chinese domains).
   - For mobile: Create a **Mobile Application**.
   - Note the **AppID** and **AppSecret**.
4. **Domain Verification** — WeChat requires domain verification for callback URLs.
5. **Configure Callback Domain** — Add your Ory Network domain in the WeChat application settings.

## Configuration

### Using the Ory CLI

Because WeChat uses non-standard OAuth parameters, you need to configure it as a generic provider with custom URLs.

1. **Create a Jsonnet claims mapper** (save as `wechat-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         // WeChat does not provide email
         // Use unionid or openid as a stable identifier
         [if 'nickname' in claims then 'nickname' else null]: claims.nickname,
         name: {
           [if 'nickname' in claims then 'full' else null]: claims.nickname,
         },
         [if 'headimgurl' in claims then 'picture' else null]: claims.headimgurl,
       },
     },
   }
   ```

2. **Add WeChat as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "wechat",
       "provider": "generic",
       "client_id": "<your-wechat-appid>",
       "client_secret": "<your-wechat-appsecret>",
       "authorization_url": "https://open.weixin.qq.com/connect/qrconnect",
       "token_url": "https://api.weixin.qq.com/sns/oauth2/access_token",
       "scope": ["snsapi_login"],
       "mapper_url": "base64://'"$(base64 < wechat-mapper.jsonnet)"'"
     }'
   ```

   > **Note:** Due to WeChat's non-standard OAuth flow (using `appid` instead of `client_id`), you may need a proxy or middleware to translate between standard OAuth2 parameters and WeChat's proprietary format. Consider using a WeChat OAuth proxy service.

3. **Enable the OIDC method:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/enabled=true'
   ```

## Technical Details

### WeChat OAuth Endpoints

| Parameter | Value (Web) | Value (Mobile/Official Account) |
|-----------|------------|-------------------------------|
| Authorization URL | `https://open.weixin.qq.com/connect/qrconnect` | `https://open.weixin.qq.com/connect/oauth2/authorize` |
| Token URL | `https://api.weixin.qq.com/sns/oauth2/access_token` | `https://api.weixin.qq.com/sns/oauth2/access_token` |
| User Info URL | `https://api.weixin.qq.com/sns/userinfo` | `https://api.weixin.qq.com/sns/userinfo` |
| Refresh Token URL | `https://api.weixin.qq.com/sns/oauth2/refresh_token` | Same |

### Available Scopes

| Scope | Platform | Description |
|-------|----------|-------------|
| `snsapi_login` | Open Platform (Web) | Web login via QR code |
| `snsapi_base` | Official Account | Silent auth, openid only |
| `snsapi_userinfo` | Official Account | User profile info |

### Claims from WeChat

| WeChat Field | Description |
|-------------|-------------|
| `openid` | Unique ID per application |
| `unionid` | Unique ID across applications (same Open Platform account) |
| `nickname` | Display name |
| `sex` | Gender (1=male, 2=female, 0=unknown) |
| `province` | Province |
| `city` | City |
| `country` | Country |
| `headimgurl` | Profile picture URL |
| `privilege` | User privileges array |

### Critical Considerations

- **No email provided:** WeChat does not share user email addresses. You must design your identity schema to work without email, or collect email separately.
- **Non-standard OAuth:** WeChat uses `appid`/`secret` instead of `client_id`/`client_secret`. A middleware layer may be required.
- **Chinese business entity required:** Registering on WeChat Open Platform requires a Chinese business license.
- **QR code flow for web:** Web login requires users to scan a QR code with the WeChat mobile app.
- **UnionID vs OpenID:** Use `unionid` for cross-application user identification; `openid` is scoped to a single application.
- **ICP filing:** Websites used with WeChat require an ICP filing (Internetinhaltanbieter, Chinese internet content provider license).
- **Rate limits:** WeChat imposes strict API rate limits.

## Example Identity Schema

### Ory Identity Schema (`identity.schema.json`)

Since WeChat does not provide email, the schema must accommodate nickname-based identification:

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
        "nickname": {
          "type": "string",
          "title": "Nickname"
        },
        "name": {
          "type": "object",
          "properties": {
            "full": { "type": "string", "title": "Display Name" }
          }
        },
        "picture": {
          "type": "string",
          "title": "Profile Picture URL"
        }
      }
    }
  }
}
```

### Jsonnet Claims Mapper (`wechat-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'nickname' in claims then 'nickname' else null]: claims.nickname,
      name: {
        [if 'nickname' in claims then 'full' else null]: claims.nickname,
      },
      [if 'headimgurl' in claims then 'picture' else null]: claims.headimgurl,
    },
  },
}
```

## Testing

1. **Web testing** requires a WeChat mobile app to scan the QR code.
2. **Use WeChat Developer Tools** for testing the mini-program flow.
3. **Test from within China** — WeChat services may have connectivity issues from outside China.
4. **Verify unionid consistency** across multiple applications under the same Open Platform account.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [WeChat Open Platform Documentation](https://developers.weixin.qq.com/doc/oplatform/en/Website_App/WeChat_Login/Wechat_Login.html)
- [WeChat OAuth 2.0 Web Login](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html)
- [WeChat UnionID Mechanism](https://developers.weixin.qq.com/doc/offiaccount/User_Management/Get_users_basic_information_UnionId_.html)
- [Ory Kratos Social Sign-In Overview](https://www.ory.sh/docs/kratos/social-signin/overview)
- [Ory Kratos Generic Provider Configuration](https://www.ory.sh/docs/kratos/social-signin/generic)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
