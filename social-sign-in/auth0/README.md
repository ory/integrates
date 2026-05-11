# Auth0 as Upstream IdP - Ory Network Integration

## Overview

Auth0 can serve as an upstream Identity Provider (IdP) for Ory Network via OIDC federation. This integration is ideal for organizations migrating from Auth0 to Ory or for federated identity scenarios where Auth0 manages a subset of users. By connecting Auth0 as a social sign-in provider, existing Auth0 users can authenticate through Ory without requiring password resets or account migration.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "auth0" provider)
       |
       v
  Auth0 Authorization Endpoint
  (https://{your-auth0-domain}/authorize)
       |
       v
  Auth0 Authentication (Universal Login)
       |
       v
  Auth0 Token Endpoint
  (https://{your-auth0-domain}/oauth/token)
       |
       v
  Auth0 Userinfo Endpoint
  (https://{your-auth0-domain}/userinfo)
       |
       v
  Ory Kratos creates/updates identity
       |
       v
  User redirected to application
```

**Use Cases:**

- **Migration:** Gradually migrate users from Auth0 to Ory by allowing Auth0 login while building native Ory identities.
- **Federation:** Maintain Auth0 as an IdP for a specific user population while using Ory for primary identity management.
- **Consolidation:** Unify multiple Auth0 tenants behind a single Ory-managed authentication layer.

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management, OIDC social sign-in strategy |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **Auth0 Account** — An active Auth0 tenant at [auth0.com](https://auth0.com).
3. **Auth0 Application** — Create a **Regular Web Application** in the Auth0 Dashboard:
   - Go to **Applications > Applications > Create Application**.
   - Select **Regular Web Applications**.
   - Note the **Domain**, **Client ID**, and **Client Secret**.
4. **Configure Auth0 Callback URL** — In the Auth0 application settings, add the Ory callback URL to **Allowed Callback URLs**:
   ```
   https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/auth0
   ```

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `auth0-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         [if 'email_verified' in claims then 'email_verified' else null]: claims.email_verified,
         name: {
           [if 'given_name' in claims then 'first' else null]: claims.given_name,
           [if 'family_name' in claims then 'last' else null]: claims.family_name,
         },
         [if 'picture' in claims then 'picture' else null]: claims.picture,
       },
     },
   }
   ```

2. **Add Auth0 as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "auth0",
       "provider": "generic",
       "client_id": "<your-auth0-client-id>",
       "client_secret": "<your-auth0-client-secret>",
       "issuer_url": "https://<your-auth0-domain>/",
       "scope": ["openid", "profile", "email"],
       "mapper_url": "base64://'"$(base64 < auth0-mapper.jsonnet)"'"
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
2. Click **Add Provider** and select **Generic Provider** (or Auth0 if available as a preset).
3. Fill in:
   - **Provider ID:** `auth0`
   - **Client ID:** Your Auth0 Client ID
   - **Client Secret:** Your Auth0 Client Secret
   - **Issuer URL:** `https://<your-auth0-domain>/`
   - **Scopes:** `openid`, `profile`, `email`
4. Upload or paste your Jsonnet mapper.
5. Click **Save**.

## Technical Details

### OIDC Configuration

| Parameter | Value |
|-----------|-------|
| Provider Type | `generic` (OIDC-compliant) |
| Issuer URL | `https://{your-auth0-domain}/` |
| Authorization URL | `https://{your-auth0-domain}/authorize` |
| Token URL | `https://{your-auth0-domain}/oauth/token` |
| Userinfo URL | `https://{your-auth0-domain}/userinfo` |
| JWKS URL | `https://{your-auth0-domain}/.well-known/jwks.json` |
| Discovery URL | `https://{your-auth0-domain}/.well-known/openid-configuration` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `openid` | Required for OIDC flow |
| `profile` | Name, nickname, picture, updated_at |
| `email` | Email address and email_verified |
| `address` | Physical address |
| `phone` | Phone number and phone_number_verified |

### Standard Claims from Auth0

| Claim | Description |
|-------|-------------|
| `sub` | Auth0 user ID (e.g., `auth0\|abc123`) |
| `email` | Email address |
| `email_verified` | Whether email is verified |
| `name` | Full name |
| `given_name` | First name |
| `family_name` | Last name |
| `picture` | Profile picture URL |
| `nickname` | Nickname |
| `locale` | User's locale |
| `updated_at` | Last profile update timestamp |

### Migration Considerations

- **Auth0 user IDs** are preserved in the Ory identity's OIDC credentials, enabling correlation.
- **Custom Auth0 claims** can be added via Auth0 Actions or Rules and mapped in the Jsonnet mapper.
- **Auth0 metadata** (app_metadata, user_metadata) can be exposed as claims using Auth0 Actions.
- Consider setting up **account linking** in Ory to merge Auth0 identities with existing Ory identities by email.

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
            "first": { "type": "string", "title": "First Name" },
            "last": { "type": "string", "title": "Last Name" }
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

### Jsonnet Claims Mapper (`auth0-mapper.jsonnet`)

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

1. **Start a login flow:**
   ```bash
   open "https://{your-project-slug}.projects.oryapis.com/self-service/login/browser"
   ```

2. **Click the Auth0 login option** and authenticate with Auth0 credentials.

3. **Verify the identity was created:**
   ```bash
   ory list identities \
     --project <your-project-id> \
     --workspace <your-workspace-id>

   ory get identity <identity-id> \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --format json
   ```

4. **Verify OIDC credentials** include the Auth0 `sub` claim.

5. **Test account linking** — create an Ory identity with the same email, then sign in via Auth0 to verify linking behavior.

6. **Test with Auth0 social connections** — if your Auth0 tenant has social connections (e.g., Google), verify that the chain works: User > Ory > Auth0 > Google.

## Resources

- [Ory Kratos Auth0 Social Sign-In Documentation](https://www.ory.sh/docs/kratos/social-signin/auth0)
- [Auth0 Regular Web Application Setup](https://auth0.com/docs/get-started/auth0-overview/create-applications/regular-web-apps)
- [Auth0 OpenID Connect Documentation](https://auth0.com/docs/authenticate/protocols/openid-connect-protocol)
- [Auth0 Scopes and Claims](https://auth0.com/docs/get-started/apis/scopes/openid-connect-scopes)
- [Ory Kratos Social Sign-In Overview](https://www.ory.sh/docs/kratos/social-signin/overview)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
