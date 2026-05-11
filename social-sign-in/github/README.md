# Sign in with GitHub - Ory Network Integration

## Overview

GitHub is the world's leading software development platform with over 100 million developers. Integrating GitHub with Ory Network is ideal for developer tools, DevOps platforms, and technical applications. GitHub's OAuth flow provides access to user profile data, email addresses, and organization/team membership, enabling org-based access control.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "github" provider)
       |
       v
  GitHub Authorization Endpoint
  (https://github.com/login/oauth/authorize)
       |
       v
  GitHub Login & Authorization
       |
       v
  GitHub Token Endpoint
  (https://github.com/login/oauth/access_token)
       |
       v
  GitHub User API (https://api.github.com/user)
  GitHub Emails API (https://api.github.com/user/emails)
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
| **Ory Kratos** | Identity management, built-in GitHub provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **GitHub Account** — Any GitHub account can create OAuth Apps.
3. **GitHub OAuth App** — Create at [github.com/settings/developers](https://github.com/settings/developers):
   - Click **New OAuth App**.
   - Set **Homepage URL** to your application URL.
   - Set **Authorization callback URL** to:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/github
     ```
   - Note the **Client ID** and generate a **Client Secret**.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `github-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'name' in claims then 'full' else null]: claims.name,
         },
         [if 'login' in claims then 'username' else null]: claims.login,
         [if 'avatar_url' in claims then 'picture' else null]: claims.avatar_url,
       },
     },
   }
   ```

2. **Add GitHub as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "github",
       "provider": "github",
       "client_id": "<your-github-client-id>",
       "client_secret": "<your-github-client-secret>",
       "scope": ["user:email", "read:user"],
       "mapper_url": "base64://'"$(base64 < github-mapper.jsonnet)"'"
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
| Provider Type | `github` (native support) |
| Authorization URL | `https://github.com/login/oauth/authorize` |
| Token URL | `https://github.com/login/oauth/access_token` |
| User Info URL | `https://api.github.com/user` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `read:user` | Read user profile data |
| `user:email` | Read user email addresses |
| `read:org` | Read organization membership |
| `repo` | Access to repositories (use sparingly) |

### Claims from GitHub

| GitHub Field | Description |
|-------------|-------------|
| `id` | Unique GitHub user ID (numeric) |
| `login` | GitHub username |
| `name` | Display name |
| `email` | Primary email |
| `avatar_url` | Profile picture URL |
| `company` | Company name |
| `blog` | Website URL |
| `location` | Location string |
| `bio` | Bio text |
| `two_factor_authentication` | Whether 2FA is enabled |

### Organization Membership Check

To verify GitHub organization membership, request the `read:org` scope and check membership via the GitHub API in your application logic after authentication. Ory Kratos handles the authentication; org-based authorization should be implemented in your application.

## Example Identity Schema

### Jsonnet Claims Mapper (`github-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'name' in claims then 'full' else null]: claims.name,
      },
      [if 'login' in claims then 'username' else null]: claims.login,
      [if 'avatar_url' in claims then 'picture' else null]: claims.avatar_url,
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with a GitHub account.
2. **Verify the identity** includes GitHub username, email, and name.
3. **Test with private email** — GitHub users can hide their email; the `user:email` scope fetches the primary email regardless.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos GitHub Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/github)
- [GitHub OAuth Apps Documentation](https://docs.github.com/en/apps/oauth-apps)
- [GitHub REST API - Users](https://docs.github.com/en/rest/users)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
