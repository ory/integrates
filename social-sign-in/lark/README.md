# Lark/Feishu Social Sign-In - Ory Network Integration

## Overview

Lark (international) / Feishu (China) is ByteDance's enterprise collaboration platform, widely used across Asia for workplace communication, project management, and business workflows. Integrating Lark with Ory Network enables B2B applications to authenticate enterprise users through their Lark accounts, making it essential for applications targeting businesses in Asia.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "lark" provider)
       |
       v
  Lark Authorization Endpoint
  (https://open.larksuite.com/open-apis/authen/v1/authorize)
       |
       v
  Lark User Authentication
       |
       v
  Lark Token Endpoint
  (https://open.larksuite.com/open-apis/authen/v1/oidc/access_token)
       |
       v
  Lark User Info API
  (https://open.larksuite.com/open-apis/authen/v1/user_info)
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
| **Ory Kratos** | Identity management, built-in Lark provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **Lark Developer Account** — Register at [open.larksuite.com](https://open.larksuite.com/) (international) or [open.feishu.cn](https://open.feishu.cn/) (China).
3. **Lark Application** — Create a web application in the Lark Open Platform:
   - Note the **App ID** and **App Secret**.
   - Configure the **Redirect URI**:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/lark
     ```
4. **Enable Permissions** — Request the following permissions in the Lark app configuration:
   - `contact:user.base:readonly` — Read basic user information.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `lark-mapper.jsonnet`):
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

2. **Add Lark as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "lark",
       "provider": "lark",
       "client_id": "<your-lark-app-id>",
       "client_secret": "<your-lark-app-secret>",
       "scope": ["openid"],
       "mapper_url": "base64://'"$(base64 < lark-mapper.jsonnet)"'"
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

### OIDC/OAuth Configuration

| Parameter | Value (International) | Value (China/Feishu) |
|-----------|----------------------|---------------------|
| Provider Type | `lark` | `lark` |
| Authorization URL | `https://open.larksuite.com/open-apis/authen/v1/authorize` | `https://open.feishu.cn/open-apis/authen/v1/authorize` |
| Token URL | `https://open.larksuite.com/open-apis/authen/v1/oidc/access_token` | `https://open.feishu.cn/open-apis/authen/v1/oidc/access_token` |
| User Info URL | `https://open.larksuite.com/open-apis/authen/v1/user_info` | `https://open.feishu.cn/open-apis/authen/v1/user_info` |

### Claims from Lark

| Claim | Description |
|-------|-------------|
| `open_id` | Unique user ID within the app |
| `union_id` | Unique user ID across apps in the same enterprise |
| `name` | Display name |
| `email` | Email address |
| `picture` | Avatar URL |
| `tenant_key` | Enterprise/tenant identifier |

## Example Identity Schema

### Jsonnet Claims Mapper (`lark-mapper.jsonnet`)

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

1. **Start a login flow** and authenticate with a Lark account.
2. **Test with both Lark (international) and Feishu (China)** if applicable.
3. **Verify identity creation** with correct email and name.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos Lark Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/lark)
- [Lark Open Platform Documentation](https://open.larksuite.com/document)
- [Lark OAuth2 Login Guide](https://open.larksuite.com/document/common-capabilities/sso/web-application-sso/web-app-overview)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
