# DingTalk Social Sign-In - Ory Network Integration

## Overview

DingTalk (by Alibaba Group) is a leading enterprise collaboration platform widely used in China with over 600 million users. Integrating DingTalk with Ory Network enables B2B applications targeting the Chinese market to authenticate users with their DingTalk corporate accounts. This is essential for enterprise applications, SaaS platforms, and internal tools serving organizations in China.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "dingtalk" provider)
       |
       v
  DingTalk Authorization Endpoint
  (https://login.dingtalk.com/oauth2/auth)
       |
       v
  DingTalk User Authentication
       |
       v
  DingTalk Token Endpoint
  (https://api.dingtalk.com/v1.0/oauth2/userAccessToken)
       |
       v
  DingTalk User Info API
  (https://api.dingtalk.com/v1.0/contact/users/me)
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
| **Ory Kratos** | Identity management, built-in DingTalk provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **DingTalk Developer Account** — Register at [open-dev.dingtalk.com](https://open-dev.dingtalk.com/).
3. **DingTalk Application** — Create an application in the DingTalk Open Platform:
   - Go to the **Application Development** section.
   - Create a new **H5 Micro Application** or **Third-party Enterprise Application**.
   - Note the **AppKey** (Client ID) and **AppSecret** (Client Secret).
4. **Configure Redirect URI** — In the application settings, add the Ory callback URL:
   ```
   https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/dingtalk
   ```
5. **Enable Login Permissions** — In the application permissions section, enable:
   - `Contact.User.Read` — to read user profile information.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `dingtalk-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'nick' in claims then 'full' else null]: claims.nick,
         },
         [if 'avatarUrl' in claims then 'picture' else null]: claims.avatarUrl,
       },
     },
   }
   ```

2. **Add DingTalk as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "dingtalk",
       "provider": "dingtalk",
       "client_id": "<your-dingtalk-appkey>",
       "client_secret": "<your-dingtalk-appsecret>",
       "scope": ["openid", "corpid"],
       "mapper_url": "base64://'"$(base64 < dingtalk-mapper.jsonnet)"'"
     }'
   ```

3. **Enable the OIDC method:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/enabled=true'
   ```

### Using the Ory Console

1. Navigate to **Authentication > Social Sign-In** in the [Ory Console](https://console.ory.sh).
2. Click **Add Provider** and select **DingTalk** (or Generic Provider).
3. Fill in:
   - **Provider ID:** `dingtalk`
   - **Client ID (AppKey):** Your DingTalk AppKey
   - **Client Secret (AppSecret):** Your DingTalk AppSecret
   - **Scopes:** `openid`, `corpid`
4. Upload or paste your Jsonnet mapper.
5. Click **Save**.

## Technical Details

### OAuth 2.0 Configuration

| Parameter | Value |
|-----------|-------|
| Provider Type | `dingtalk` (native support) |
| Authorization URL | `https://login.dingtalk.com/oauth2/auth` |
| Token URL | `https://api.dingtalk.com/v1.0/oauth2/userAccessToken` |
| User Info URL | `https://api.dingtalk.com/v1.0/contact/users/me` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `openid` | Basic user information |
| `corpid` | Corporate/organization information |

### Claims from DingTalk

| DingTalk Field | Description |
|---------------|-------------|
| `openId` | Unique user identifier within the app |
| `unionId` | Unique user identifier across apps |
| `nick` | User's display name |
| `email` | Email address (if available) |
| `avatarUrl` | Profile picture URL |
| `mobile` | Phone number (requires additional permission) |
| `stateCode` | Country code for mobile |

### Considerations

- **Chinese market focus:** DingTalk is primarily used in China; ensure your infrastructure supports connectivity to DingTalk APIs.
- **Enterprise context:** DingTalk users are typically associated with an organization, which can be leveraged for B2B access control.
- **Mobile number as primary identifier:** Many DingTalk users identify by mobile number rather than email.
- **API rate limits:** DingTalk imposes rate limits on API calls; plan accordingly for high-traffic applications.

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
        },
        "picture": {
          "type": "string",
          "title": "Avatar URL"
        }
      },
      "required": ["email"]
    }
  }
}
```

### Jsonnet Claims Mapper (`dingtalk-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'nick' in claims then 'full' else null]: claims.nick,
      },
      [if 'avatarUrl' in claims then 'picture' else null]: claims.avatarUrl,
    },
  },
}
```

## Testing

1. **Start a login flow:**
   ```bash
   open "https://{your-project-slug}.projects.oryapis.com/self-service/login/browser"
   ```

2. **Click "Login with DingTalk"** and authenticate with a DingTalk account.

3. **Verify the identity:**
   ```bash
   ory list identities \
     --project <your-project-id> \
     --workspace <your-workspace-id>

   ory get identity <identity-id> \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --format json
   ```

4. **Test with a corporate DingTalk account** to verify organization-scoped attributes.

5. **Test from within China** or with a VPN to ensure connectivity to DingTalk APIs.

## Resources

- [Ory Kratos DingTalk Social Sign-In Documentation](https://www.ory.sh/docs/kratos/social-signin/dingtalk)
- [DingTalk Open Platform Documentation](https://open-dev.dingtalk.com/document/)
- [DingTalk OAuth 2.0 Login Guide](https://open.dingtalk.com/document/orgapp/tutorial-obtaining-user-personal-information)
- [Ory Kratos Social Sign-In Overview](https://www.ory.sh/docs/kratos/social-signin/overview)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
