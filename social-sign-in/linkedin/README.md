# Sign In with LinkedIn - Ory Network Integration

## Overview

LinkedIn is the world's largest professional network with over 900 million members. LinkedIn provides OIDC-compliant authentication through its "Sign In with LinkedIn using OpenID Connect" product. This integration is ideal for B2B applications, recruitment platforms, professional networking tools, and any application that benefits from verified professional identity.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "linkedin" provider)
       |
       v
  LinkedIn Authorization Endpoint
  (https://www.linkedin.com/oauth/v2/authorization)
       |
       v
  LinkedIn Login & Consent
       |
       v
  LinkedIn Token Endpoint
  (https://www.linkedin.com/oauth/v2/accessToken)
       |
       v
  LinkedIn Userinfo Endpoint
  (https://api.linkedin.com/v2/userinfo)
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
| **Ory Kratos** | Identity management, built-in LinkedIn provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **LinkedIn Developer Account** — Register at [developer.linkedin.com](https://developer.linkedin.com/).
3. **LinkedIn App** — Create at the LinkedIn Developer Portal:
   - Go to **My Apps > Create App**.
   - Fill in app name, LinkedIn Page, and logo.
   - Under **Auth** tab, add the redirect URL:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/linkedin
     ```
   - Request the **Sign In with LinkedIn using OpenID Connect** product.
   - Note the **Client ID** and **Client Secret**.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `linkedin-mapper.jsonnet`):
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

2. **Add LinkedIn as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "linkedin",
       "provider": "linkedin",
       "client_id": "<your-linkedin-client-id>",
       "client_secret": "<your-linkedin-client-secret>",
       "scope": ["openid", "profile", "email"],
       "mapper_url": "base64://'"$(base64 < linkedin-mapper.jsonnet)"'"
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
| Provider Type | `linkedin` (native support) |
| Authorization URL | `https://www.linkedin.com/oauth/v2/authorization` |
| Token URL | `https://www.linkedin.com/oauth/v2/accessToken` |
| Userinfo URL | `https://api.linkedin.com/v2/userinfo` |
| JWKS URL | `https://www.linkedin.com/oauth/openid/jwks` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `openid` | OIDC ID token |
| `profile` | First name, last name, profile picture |
| `email` | Email address |

### Claims from LinkedIn

| Claim | Description |
|-------|-------------|
| `sub` | Unique LinkedIn member ID |
| `email` | Email address |
| `email_verified` | Whether email is verified |
| `given_name` | First name |
| `family_name` | Last name |
| `name` | Full name |
| `picture` | Profile picture URL |
| `locale` | User's locale |

## Example Identity Schema

### Jsonnet Claims Mapper (`linkedin-mapper.jsonnet`)

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

## Testing

1. **Start a login flow** and authenticate with a LinkedIn account.
2. **Verify the identity** includes email, first name, and last name.
3. **Note:** LinkedIn requires the "Sign In with LinkedIn using OpenID Connect" product to be approved for your app.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos LinkedIn Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/linkedin)
- [LinkedIn Sign In with OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)
- [LinkedIn OAuth 2.0 Authorization](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
