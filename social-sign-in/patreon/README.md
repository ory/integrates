# Patreon Social Sign-In - Ory Network Integration

## Overview

Patreon is the leading membership and subscription platform for creators, with millions of patrons supporting content creators. Integrating Patreon with Ory Network enables applications to authenticate users via their Patreon accounts and verify membership/subscription tiers, making it ideal for gated content, community platforms, and creator tools.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "patreon" provider)
       |
       v
  Patreon Authorization Endpoint
  (https://www.patreon.com/oauth2/authorize)
       |
       v
  Patreon Login & Consent
       |
       v
  Patreon Token Endpoint
  (https://www.patreon.com/api/oauth2/token)
       |
       v
  Patreon API v2
  (https://www.patreon.com/api/oauth2/v2/identity)
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
2. **Patreon Account** — A Patreon account (creator or patron).
3. **Patreon API Client** — Create at [patreon.com/portal/registration/register-clients](https://www.patreon.com/portal/registration/register-clients):
   - Set the **Redirect URI**:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/patreon
     ```
   - Note the **Client ID** and **Client Secret**.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `patreon-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'full_name' in claims then 'full' else null]: claims.full_name,
         },
         [if 'image_url' in claims then 'picture' else null]: claims.image_url,
       },
     },
   }
   ```

2. **Add Patreon as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "patreon",
       "provider": "patreon",
       "client_id": "<your-patreon-client-id>",
       "client_secret": "<your-patreon-client-secret>",
       "scope": ["identity", "identity[email]"],
       "mapper_url": "base64://'"$(base64 < patreon-mapper.jsonnet)"'"
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
| Provider Type | `patreon` (native support) |
| Authorization URL | `https://www.patreon.com/oauth2/authorize` |
| Token URL | `https://www.patreon.com/api/oauth2/token` |
| User Info URL | `https://www.patreon.com/api/oauth2/v2/identity` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `identity` | Basic user identity (name, vanity, about) |
| `identity[email]` | User's email address |
| `identity.memberships` | Membership/pledge information |
| `campaigns` | Creator campaign information |

### Claims from Patreon

| Patreon Field | Description |
|--------------|-------------|
| `id` | Unique Patreon user ID |
| `email` | Email address |
| `full_name` | Full name |
| `vanity` | Vanity URL name |
| `image_url` | Profile picture URL |
| `is_email_verified` | Whether email is verified |
| `about` | User's bio |

### Membership Verification

To verify Patreon membership tiers after authentication, use the `identity.memberships` scope and check the membership data in your application logic. This is separate from the Ory authentication flow.

## Example Identity Schema

### Jsonnet Claims Mapper (`patreon-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'full_name' in claims then 'full' else null]: claims.full_name,
      },
      [if 'image_url' in claims then 'picture' else null]: claims.image_url,
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with a Patreon account.
2. **Verify identity creation** with email and full name.
3. **Test with patron and creator accounts** to verify different claim availability.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos Patreon Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/patreon)
- [Patreon API Documentation](https://docs.patreon.com/)
- [Patreon OAuth2 Guide](https://docs.patreon.com/#oauth)
- [Patreon API v2 Reference](https://docs.patreon.com/#apiv2-resource-endpoints)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
