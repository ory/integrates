# Facebook Login - Ory Network Integration

## Overview

Facebook Login is one of the most widely recognized social sign-in options, with access to billions of Facebook and Meta accounts. Integrating Facebook Login with Ory Network provides a familiar authentication experience for consumer applications across e-commerce, media, social, and entertainment verticals.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "facebook" provider)
       |
       v
  Facebook Authorization Endpoint
  (https://www.facebook.com/v18.0/dialog/oauth)
       |
       v
  Facebook Login Dialog
       |
       v
  Facebook Token Endpoint
  (https://graph.facebook.com/v18.0/oauth/access_token)
       |
       v
  Facebook Graph API - User Profile
  (https://graph.facebook.com/v18.0/me)
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
| **Ory Kratos** | Identity management, built-in Facebook provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **Meta Developer Account** — Register at [developers.facebook.com](https://developers.facebook.com/).
3. **Facebook App** — Create a new app:
   - Go to **My Apps > Create App**.
   - Choose the **Consumer** or **Business** app type.
   - Add the **Facebook Login** product.
   - Note the **App ID** (Client ID) and **App Secret** (Client Secret).
4. **Configure OAuth Redirect URI** — In Facebook Login > Settings, add:
   ```
   https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/facebook
   ```
5. **App Review** — For production use beyond the app's test users, submit for App Review with the required permissions.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `facebook-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'first_name' in claims then 'first' else null]: claims.first_name,
           [if 'last_name' in claims then 'last' else null]: claims.last_name,
         },
         [if 'picture' in claims then 'picture' else null]:
           if 'picture' in claims && std.isObject(claims.picture) then
             claims.picture.data.url
           else
             claims.picture,
       },
     },
   }
   ```

2. **Add Facebook as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "facebook",
       "provider": "facebook",
       "client_id": "<your-facebook-app-id>",
       "client_secret": "<your-facebook-app-secret>",
       "scope": ["email", "public_profile"],
       "mapper_url": "base64://'"$(base64 < facebook-mapper.jsonnet)"'"
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
| Provider Type | `facebook` (native support) |
| Authorization URL | `https://www.facebook.com/v18.0/dialog/oauth` |
| Token URL | `https://graph.facebook.com/v18.0/oauth/access_token` |
| User Info URL | `https://graph.facebook.com/me?fields=id,name,first_name,last_name,email,picture` |

### Available Scopes

| Scope | Description | App Review Required |
|-------|-------------|-------------------|
| `public_profile` | Name, picture, age range, gender, locale | No |
| `email` | Email address | No |
| `user_birthday` | Date of birth | Yes |
| `user_location` | Current city | Yes |
| `user_friends` | Friends list who also use your app | Yes |

### Claims from Facebook

| Facebook Field | Description |
|---------------|-------------|
| `id` | Unique Facebook user ID |
| `email` | Email address |
| `first_name` | First name |
| `last_name` | Last name |
| `name` | Full name |
| `picture` | Profile picture (nested object with `data.url`) |

### Important Considerations

- **App Review:** To use scopes beyond `email` and `public_profile` in production, you must submit for Meta App Review.
- **Business Verification:** Some advanced features require business verification.
- **Limited Login:** Meta now offers "Limited Login" mode with reduced data access. Standard login is recommended for Ory integration.
- **HTTPS Required:** Facebook requires HTTPS for all redirect URIs (Ory Network provides this by default).
- **Email may be absent:** Not all Facebook accounts have a verified email. Handle this in your identity schema by making email optional or providing a fallback.

## Example Identity Schema

### Jsonnet Claims Mapper (`facebook-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'first_name' in claims then 'first' else null]: claims.first_name,
        [if 'last_name' in claims then 'last' else null]: claims.last_name,
      },
    },
  },
}
```

## Testing

1. **Use Facebook test users** — In the Facebook Developer Dashboard, create test users under App Roles > Test Users.
2. **Start a login flow** and authenticate with a test user.
3. **Verify identity creation** with correct email and name mapping.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos Facebook Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/facebook)
- [Facebook Login Documentation](https://developers.facebook.com/docs/facebook-login/)
- [Facebook Graph API User Reference](https://developers.facebook.com/docs/graph-api/reference/user)
- [Meta App Review](https://developers.facebook.com/docs/app-review)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
