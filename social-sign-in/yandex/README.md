# Yandex Login - Ory Network Integration

## Overview

Yandex is Russia's largest technology company and internet services provider, with services spanning search, email, maps, ride-hailing, and more. Yandex ID provides OAuth 2.0 authentication with access to Yandex user profiles. Integrating Yandex with Ory Network is important for applications targeting the Russian market, where Yandex services are widely used.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "yandex" provider)
       |
       v
  Yandex Authorization Endpoint
  (https://oauth.yandex.com/authorize)
       |
       v
  Yandex Login & Consent
       |
       v
  Yandex Token Endpoint
  (https://oauth.yandex.com/token)
       |
       v
  Yandex User Info API
  (https://login.yandex.ru/info)
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
| **Ory Kratos** | Identity management, built-in Yandex provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **Yandex Account** — Register at [yandex.com](https://yandex.com/).
3. **Yandex OAuth Application** — Create at [oauth.yandex.com/client/new](https://oauth.yandex.com/client/new):
   - Set **Callback URI**:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/yandex
     ```
   - Select required permissions: **Yandex.Passport API** (login:email, login:info, login:avatar).
   - Note the **Client ID** and **Client Secret**.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `yandex-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'default_email' in claims then 'email' else null]: claims.default_email,
         name: {
           [if 'first_name' in claims then 'first' else null]: claims.first_name,
           [if 'last_name' in claims then 'last' else null]: claims.last_name,
         },
       },
     },
   }
   ```

2. **Add Yandex as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "yandex",
       "provider": "yandex",
       "client_id": "<your-yandex-client-id>",
       "client_secret": "<your-yandex-client-secret>",
       "scope": ["login:email", "login:info", "login:avatar"],
       "mapper_url": "base64://'"$(base64 < yandex-mapper.jsonnet)"'"
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
| Provider Type | `yandex` (native support) |
| Authorization URL | `https://oauth.yandex.com/authorize` |
| Token URL | `https://oauth.yandex.com/token` |
| User Info URL | `https://login.yandex.ru/info` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `login:email` | User's email address |
| `login:info` | Basic profile info (name, gender, birthday) |
| `login:avatar` | Profile picture |

### Claims from Yandex

| Yandex Field | Description |
|-------------|-------------|
| `id` | Unique Yandex user ID |
| `login` | Yandex username |
| `default_email` | Primary email address |
| `first_name` | First name |
| `last_name` | Last name |
| `display_name` | Display name |
| `default_avatar_id` | Avatar ID for constructing image URL |
| `is_avatar_empty` | Whether user has a custom avatar |
| `birthday` | Date of birth |
| `gender` | Gender |

## Example Identity Schema

### Jsonnet Claims Mapper (`yandex-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'default_email' in claims then 'email' else null]: claims.default_email,
      name: {
        [if 'first_name' in claims then 'first' else null]: claims.first_name,
        [if 'last_name' in claims then 'last' else null]: claims.last_name,
      },
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with a Yandex account.
2. **Verify identity creation** with email and name.
3. **Note:** Yandex uses `default_email` rather than `email` as the claim name.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos Yandex Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/yandex)
- [Yandex OAuth Documentation](https://yandex.com/dev/id/doc/en/)
- [Yandex Passport API](https://yandex.com/dev/passport/doc/dg/reference/response.html)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
