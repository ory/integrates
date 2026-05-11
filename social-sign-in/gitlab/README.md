# GitLab Social Sign-In - Ory Network Integration

## Overview

GitLab is a comprehensive DevOps platform used by millions of developers and organizations. GitLab supports OpenID Connect natively, making it a straightforward OIDC provider for Ory Network. This integration is ideal for DevOps tools, CI/CD dashboards, and developer-facing applications. Both GitLab.com and self-managed GitLab instances can be used.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "gitlab" provider)
       |
       v
  GitLab Authorization Endpoint
  (https://gitlab.com/oauth/authorize)
       |
       v
  GitLab Login & Authorization
       |
       v
  GitLab Token Endpoint
  (https://gitlab.com/oauth/token)
       |
       v
  GitLab Userinfo Endpoint
  (https://gitlab.com/oauth/userinfo)
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
| **Ory Kratos** | Identity management, built-in GitLab provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **GitLab Account** — On GitLab.com or a self-managed instance.
3. **GitLab OAuth Application** — Create at **User Settings > Applications** (or **Admin > Applications** for instance-wide):
   - Set **Redirect URI** to:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/gitlab
     ```
   - Select scopes: `openid`, `profile`, `email`.
   - Note the **Application ID** (Client ID) and **Secret** (Client Secret).

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `gitlab-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'name' in claims then 'full' else null]: claims.name,
         },
         [if 'nickname' in claims then 'username' else null]: claims.nickname,
         [if 'picture' in claims then 'picture' else null]: claims.picture,
       },
     },
   }
   ```

2. **Add GitLab as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "gitlab",
       "provider": "gitlab",
       "client_id": "<your-gitlab-application-id>",
       "client_secret": "<your-gitlab-secret>",
       "issuer_url": "https://gitlab.com",
       "scope": ["openid", "profile", "email"],
       "mapper_url": "base64://'"$(base64 < gitlab-mapper.jsonnet)"'"
     }'
   ```

   For self-managed GitLab, replace `issuer_url` with your instance URL.

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
| Provider Type | `gitlab` (native support) |
| Issuer URL | `https://gitlab.com` |
| Authorization URL | `https://gitlab.com/oauth/authorize` |
| Token URL | `https://gitlab.com/oauth/token` |
| Userinfo URL | `https://gitlab.com/oauth/userinfo` |
| JWKS URL | `https://gitlab.com/oauth/discovery/keys` |
| Discovery URL | `https://gitlab.com/.well-known/openid-configuration` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `openid` | OIDC ID token |
| `profile` | Name, username, avatar |
| `email` | Email address |
| `read_user` | Read user profile via API |

### Claims from GitLab

| Claim | Description |
|-------|-------------|
| `sub` | Unique GitLab user ID |
| `email` | Email address |
| `email_verified` | Whether email is verified |
| `name` | Full name |
| `nickname` | GitLab username |
| `picture` | Avatar URL |
| `groups` | Group memberships (self-managed) |

## Example Identity Schema

### Jsonnet Claims Mapper (`gitlab-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'name' in claims then 'full' else null]: claims.name,
      },
      [if 'nickname' in claims then 'username' else null]: claims.nickname,
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with a GitLab account.
2. **Verify the identity** includes email, name, and GitLab username.
3. **Test with self-managed GitLab** by changing the `issuer_url`.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos GitLab Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/gitlab)
- [GitLab OAuth2 Provider Documentation](https://docs.gitlab.com/ee/integration/oauth_provider.html)
- [GitLab OpenID Connect](https://docs.gitlab.com/ee/integration/openid_connect_provider.html)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
