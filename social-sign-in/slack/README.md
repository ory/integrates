# Sign in with Slack - Ory Network Integration

## Overview

Slack is the leading workplace communication platform used by millions of teams worldwide. Sign in with Slack enables workspace-based authentication, allowing applications to verify a user's Slack workspace membership. This integration is ideal for internal tools, productivity apps, and B2B SaaS applications where Slack workspace membership serves as an identity signal.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "slack" provider)
       |
       v
  Slack Authorization Endpoint
  (https://slack.com/openid/connect/authorize)
       |
       v
  Slack Login & Workspace Selection
       |
       v
  Slack Token Endpoint
  (https://slack.com/api/openid.connect.token)
       |
       v
  Slack Userinfo Endpoint
  (https://slack.com/api/openid.connect.userInfo)
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
| **Ory Kratos** | Identity management, built-in Slack provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **Slack Account** — A Slack workspace.
3. **Slack App** — Create at [api.slack.com/apps](https://api.slack.com/apps):
   - Click **Create New App > From scratch**.
   - Select your workspace.
   - Under **OAuth & Permissions**, add the **Redirect URL**:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/slack
     ```
   - Under **OpenID Connect** section, note the **Client ID** and **Client Secret**.
   - Add required scopes under **User Token Scopes**: `openid`, `profile`, `email`.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `slack-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'name' in claims then 'full' else null]: claims.name,
         },
         [if 'picture' in claims then 'picture' else null]: claims.picture,
       },
     },
   }
   ```

2. **Add Slack as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "slack",
       "provider": "slack",
       "client_id": "<your-slack-client-id>",
       "client_secret": "<your-slack-client-secret>",
       "scope": ["openid", "profile", "email"],
       "mapper_url": "base64://'"$(base64 < slack-mapper.jsonnet)"'"
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
| Provider Type | `slack` (native support) |
| Authorization URL | `https://slack.com/openid/connect/authorize` |
| Token URL | `https://slack.com/api/openid.connect.token` |
| Userinfo URL | `https://slack.com/api/openid.connect.userInfo` |
| Discovery URL | `https://slack.com/.well-known/openid-configuration` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `openid` | OIDC ID token |
| `profile` | Name and picture |
| `email` | Email address |

### Claims from Slack

| Claim | Description |
|-------|-------------|
| `sub` | Unique Slack user ID |
| `email` | Email address |
| `email_verified` | Whether email is verified |
| `name` | Display name |
| `picture` | Avatar URL |
| `https://slack.com/team_id` | Workspace ID |
| `https://slack.com/team_name` | Workspace name |

### Workspace-Based Access Control

Slack's `team_id` claim can be used to restrict access to users from specific Slack workspaces. Implement this check in your application logic or Jsonnet mapper.

## Example Identity Schema

### Jsonnet Claims Mapper (`slack-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'name' in claims then 'full' else null]: claims.name,
      },
      [if 'picture' in claims then 'picture' else null]: claims.picture,
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with a Slack account.
2. **Verify workspace association** — check the `team_id` and `team_name` claims.
3. **Test with multiple workspaces** to verify correct workspace selection.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos Slack Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/slack)
- [Slack Sign in with Slack](https://api.slack.com/authentication/sign-in-with-slack)
- [Slack OpenID Connect](https://api.slack.com/authentication/sign-in-with-slack#openid)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
