# Sign in with Microsoft - Ory Network Integration

## Overview

Microsoft identity platform supports authentication for both consumer Microsoft accounts (Outlook.com, Xbox, Hotmail) and organizational accounts (Azure AD / Microsoft Entra ID). This makes it suitable for both B2C and B2B applications. Integrating Microsoft with Ory Network provides access to the broad Microsoft ecosystem.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "microsoft" provider)
       |
       v
  Microsoft Authorization Endpoint
  (https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize)
       |
       v
  Microsoft Login (Consumer or Work/School)
       |
       v
  Microsoft Token Endpoint
  (https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token)
       |
       v
  Microsoft Graph / Userinfo
  (https://graph.microsoft.com/oidc/userinfo)
       |
       v
  Ory Kratos creates/updates identity
       |
       v
  User redirected to application
```

### Tenant Options

| Tenant Value | Accepts |
|-------------|---------|
| `common` | Both consumer and organizational accounts |
| `consumers` | Consumer Microsoft accounts only |
| `organizations` | Organizational (work/school) accounts only |
| `{tenant-id}` | Specific Azure AD tenant only |

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management, built-in Microsoft provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **Microsoft Azure Account** — Register at [portal.azure.com](https://portal.azure.com).
3. **App Registration** — Create in Azure Portal > Microsoft Entra ID > App registrations:
   - Click **New registration**.
   - Set **Supported account types** based on your needs (see tenant options above).
   - Add **Redirect URI** (Web):
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/microsoft
     ```
   - Note the **Application (client) ID**.
   - Under **Certificates & secrets**, create a **Client secret** and note its value.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `microsoft-mapper.jsonnet`):
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

2. **Add Microsoft as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "microsoft",
       "provider": "microsoft",
       "client_id": "<your-application-client-id>",
       "client_secret": "<your-client-secret>",
       "microsoft_tenant": "common",
       "scope": ["openid", "profile", "email"],
       "mapper_url": "base64://'"$(base64 < microsoft-mapper.jsonnet)"'"
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
| Provider Type | `microsoft` (native support) |
| Issuer URL | `https://login.microsoftonline.com/{tenant}/v2.0` |
| Authorization URL | `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize` |
| Token URL | `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` |
| Userinfo URL | `https://graph.microsoft.com/oidc/userinfo` |
| Discovery URL | `https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `openid` | OIDC ID token |
| `profile` | Name, preferred_username |
| `email` | Email address |
| `User.Read` | Read user profile via Microsoft Graph |
| `offline_access` | Refresh token |

### Claims from Microsoft

| Claim | Description |
|-------|-------------|
| `sub` | Unique user identifier (pairwise per app) |
| `email` | Email address |
| `name` | Full display name |
| `given_name` | First name |
| `family_name` | Last name |
| `preferred_username` | Username (usually email) |
| `oid` | Object ID (consistent across apps in same tenant) |
| `tid` | Tenant ID |

### Important Considerations

- **Client secrets expire** — Azure AD client secrets have a maximum lifetime (up to 2 years). Set a reminder to rotate.
- **Consumer vs. organizational** — The `email` claim may not be available for all consumer accounts. Use `preferred_username` as a fallback.
- **Pairwise subject** — The `sub` claim is different per application registration. Use `oid` for consistent user identification across apps.

## Example Identity Schema

### Jsonnet Claims Mapper (`microsoft-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      email:
        if 'email' in claims then claims.email
        else if 'preferred_username' in claims then claims.preferred_username
        else '',
      name: {
        [if 'given_name' in claims then 'first' else null]: claims.given_name,
        [if 'family_name' in claims then 'last' else null]: claims.family_name,
      },
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with a Microsoft account.
2. **Test with both consumer and work accounts** if using `common` tenant.
3. **Verify identity creation** — check that email fallback to `preferred_username` works.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos Microsoft Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/microsoft)
- [Microsoft Identity Platform Documentation](https://learn.microsoft.com/en-us/entra/identity-platform/)
- [Microsoft OAuth 2.0 Authorization Code Flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Microsoft Graph API](https://learn.microsoft.com/en-us/graph/overview)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
