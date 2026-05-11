# GitHub App Authentication - Ory Network Integration

## Overview

GitHub App authentication goes beyond simple OAuth login by leveraging GitHub Apps, which can act on behalf of users with fine-grained permissions and can also authenticate as the app itself for server-to-server operations. This integration uses Ory Hydra for OAuth2 server capabilities alongside Ory Kratos for identity management, enabling complex token issuance flows for GitHub App integrations.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI (Kratos)
       |
       v
  Ory Kratos (OIDC Strategy - GitHub OAuth)
       |
       v
  GitHub App Authorization
  (https://github.com/login/oauth/authorize)
       |
       v
  GitHub User Authorization & Installation
       |
       v
  GitHub Token Endpoint
       |
       v
  Ory Kratos creates/updates identity
       |
       v
  Ory Hydra (OAuth2 Server)
  - Issues access/refresh tokens for your API
  - Manages consent flows
       |
       v
  Your Application API
  (Uses Hydra tokens + GitHub App installation tokens)
```

**GitHub App vs OAuth App:**

| Feature | OAuth App | GitHub App |
|---------|-----------|------------|
| Permissions | Broad scopes | Fine-grained, per-repository |
| Rate limits | 5,000 req/hour per user | 5,000 req/hour per installation |
| Installation | Per-user authorization | Per-org/account installation |
| Server-to-server | Not supported | JWT-based app authentication |
| Webhooks | Limited | Rich webhook events |

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | User identity management and GitHub OAuth login |
| **Ory Hydra** | OAuth2/OIDC server for issuing your application's tokens |
| **Ory Network** | Managed cloud hosting for both services |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **GitHub Account** — With permission to create GitHub Apps.
3. **GitHub App** — Create at [github.com/settings/apps/new](https://github.com/settings/apps/new):
   - Set **Homepage URL** to your application URL.
   - Set **Callback URL** for user authorization:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/github-app
     ```
   - Enable **Request user authorization (OAuth) during installation**.
   - Configure required **Permissions** (e.g., repository contents, issues, pull requests).
   - Generate a **Private Key** (.pem file) for server-to-server authentication.
   - Note the **App ID**, **Client ID**, and **Client Secret**.

4. **Ory Hydra OAuth2 Client** — Create an OAuth2 client in Ory Network for your application:
   ```bash
   ory create oauth2-client \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --name "My GitHub App Integration" \
     --grant-type authorization_code,refresh_token \
     --response-type code \
     --redirect-uri "https://your-app.com/callback" \
     --scope openid,offline_access,github:repos
   ```

## Configuration

### Step 1: Configure GitHub as Social Sign-In (Kratos)

```bash
ory patch identity-config \
  --project <your-project-id> \
  --workspace <your-workspace-id> \
  --add '/selfservice/methods/oidc/config/providers/-={
    "id": "github-app",
    "provider": "github",
    "client_id": "<your-github-app-client-id>",
    "client_secret": "<your-github-app-client-secret>",
    "scope": ["user:email", "read:user"],
    "mapper_url": "base64://'"$(base64 < github-app-mapper.jsonnet)"'"
  }'
```

### Step 2: Set Up Hydra OAuth2 Client

The Ory Hydra component handles issuing your application's own OAuth2 tokens, separate from GitHub's tokens.

```bash
ory create oauth2-client \
  --project <your-project-id> \
  --workspace <your-workspace-id> \
  --name "GitHub App Integration Client" \
  --grant-type authorization_code,refresh_token,client_credentials \
  --response-type code \
  --redirect-uri "https://your-app.com/oauth/callback" \
  --scope openid,offline_access
```

### Step 3: Implement Consent & Token Exchange

Your application needs to:

1. Authenticate the user via Kratos (GitHub login).
2. Use the GitHub App installation token for GitHub API operations.
3. Issue your own tokens via Hydra for API authorization.

## Technical Details

### GitHub App JWT Authentication (Server-to-Server)

For server-to-server operations, your app authenticates as the GitHub App itself:

```bash
# Generate JWT from your GitHub App private key
# Header: {"alg": "RS256", "typ": "JWT"}
# Payload: {"iss": "<app-id>", "iat": <now>, "exp": <now+600>}
# Sign with your .pem private key
```

Then exchange the JWT for an installation access token:

```
POST https://api.github.com/app/installations/{installation_id}/access_tokens
Authorization: Bearer <jwt>
```

### Token Architecture

| Token | Issuer | Purpose |
|-------|--------|---------|
| GitHub OAuth token | GitHub | User-authorized GitHub API access |
| GitHub App installation token | GitHub | Server-to-server GitHub API access |
| Ory session token | Ory Kratos | User session management |
| Ory OAuth2 access token | Ory Hydra | Your API authorization |

## Example Identity Schema

### Jsonnet Claims Mapper (`github-app-mapper.jsonnet`)

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

1. **Install the GitHub App** on a test organization or personal account.
2. **Start a login flow** and authorize the GitHub App.
3. **Verify identity creation** and that the GitHub App installation is linked.
4. **Test server-to-server** by generating a JWT and requesting an installation token.
5. **Test Hydra token issuance** by completing the OAuth2 authorization code flow.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos GitHub Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/github)
- [GitHub Apps Documentation](https://docs.github.com/en/apps/creating-github-apps)
- [GitHub App Authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app)
- [Ory Hydra OAuth2 Documentation](https://www.ory.sh/docs/hydra)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
