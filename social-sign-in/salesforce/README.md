# Salesforce Social Sign-In - Ory Network Integration

## Overview

Salesforce is the world's leading CRM platform with a large ecosystem of enterprise users. Salesforce supports OpenID Connect, making it a straightforward OIDC provider for Ory Network. This integration enables enterprise applications to authenticate Salesforce users, making it ideal for CRM integrations, partner portals, and B2B applications where users already have Salesforce accounts.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "salesforce" provider)
       |
       v
  Salesforce Authorization Endpoint
  (https://login.salesforce.com/services/oauth2/authorize)
       |
       v
  Salesforce Login
       |
       v
  Salesforce Token Endpoint
  (https://login.salesforce.com/services/oauth2/token)
       |
       v
  Salesforce Userinfo Endpoint
  (https://login.salesforce.com/services/oauth2/userinfo)
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
| **Ory Kratos** | Identity management, OIDC provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **Salesforce Account** — An active Salesforce org (Developer, Enterprise, etc.).
3. **Salesforce Connected App** — Create in Salesforce Setup:
   - Go to **Setup > App Manager > New Connected App**.
   - Enable **OAuth Settings**.
   - Set **Callback URL**:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/salesforce
     ```
   - Select OAuth scopes: `openid`, `profile`, `email`, `id`.
   - Note the **Consumer Key** (Client ID) and **Consumer Secret** (Client Secret).

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `salesforce-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'given_name' in claims then 'first' else null]: claims.given_name,
           [if 'family_name' in claims then 'last' else null]: claims.family_name,
         },
         [if 'picture' in claims then 'picture' else null]: claims.picture,
       },
     },
   }
   ```

2. **Add Salesforce as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "salesforce",
       "provider": "salesforce",
       "client_id": "<your-salesforce-consumer-key>",
       "client_secret": "<your-salesforce-consumer-secret>",
       "issuer_url": "https://login.salesforce.com",
       "scope": ["openid", "profile", "email"],
       "mapper_url": "base64://'"$(base64 < salesforce-mapper.jsonnet)"'"
     }'
   ```

   For sandbox environments, use `https://test.salesforce.com` as the issuer URL.

3. **Enable the OIDC method:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/enabled=true'
   ```

## Technical Details

### OIDC Configuration

| Parameter | Value (Production) | Value (Sandbox) |
|-----------|-------------------|-----------------|
| Provider Type | `salesforce` (native support) | `salesforce` |
| Issuer URL | `https://login.salesforce.com` | `https://test.salesforce.com` |
| Authorization URL | `https://login.salesforce.com/services/oauth2/authorize` | `https://test.salesforce.com/services/oauth2/authorize` |
| Token URL | `https://login.salesforce.com/services/oauth2/token` | `https://test.salesforce.com/services/oauth2/token` |
| Userinfo URL | `https://login.salesforce.com/services/oauth2/userinfo` | `https://test.salesforce.com/services/oauth2/userinfo` |
| Discovery URL | `https://login.salesforce.com/.well-known/openid-configuration` | `https://test.salesforce.com/.well-known/openid-configuration` |

### Claims from Salesforce

| Claim | Description |
|-------|-------------|
| `sub` | Salesforce user URL |
| `email` | Email address |
| `email_verified` | Whether email is verified |
| `given_name` | First name |
| `family_name` | Last name |
| `name` | Full name |
| `picture` | Profile photo URL |
| `organization_id` | Salesforce org ID |
| `nickname` | User nickname |
| `preferred_username` | Username |

## Example Identity Schema

### Jsonnet Claims Mapper (`salesforce-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'given_name' in claims then 'first' else null]: claims.given_name,
        [if 'family_name' in claims then 'last' else null]: claims.family_name,
      },
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with a Salesforce account.
2. **Test with sandbox** by changing the issuer URL to `https://test.salesforce.com`.
3. **Verify identity creation** with correct email and name.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos Salesforce Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/salesforce)
- [Salesforce Connected Apps](https://help.salesforce.com/s/articleView?id=sf.connected_app_overview.htm)
- [Salesforce OAuth 2.0 Web Server Flow](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_web_server_flow.htm)
- [Salesforce OpenID Connect Discovery](https://login.salesforce.com/.well-known/openid-configuration)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
