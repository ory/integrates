# Battle.net Login - Ory Network Integration

> **Status: Community/Proposed** — This integration does not have official Ory documentation yet. Battle.net supports standard OAuth 2.0 with OIDC, making it straightforward to integrate.

## Overview

Battle.net is Blizzard Entertainment's online gaming platform, providing access to games like World of Warcraft, Diablo, Overwatch, StarCraft, and Hearthstone. With millions of active players, Battle.net Login is essential for gaming community sites, fan tools, guild management platforms, and esports applications within the Blizzard ecosystem.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "battle-net" provider)
       |
       v
  Battle.net Authorization Endpoint
  (https://oauth.battle.net/authorize)
       |
       v
  Battle.net Login
       |
       v
  Battle.net Token Endpoint
  (https://oauth.battle.net/token)
       |
       v
  Battle.net User Info API
  (https://oauth.battle.net/userinfo)
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
| **Ory Kratos** | Identity management, generic OIDC provider strategy |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **Blizzard Developer Account** — Register at [develop.battle.net](https://develop.battle.net/).
3. **Battle.net API Client** — Create at [develop.battle.net/access/clients](https://develop.battle.net/access/clients):
   - Click **Create Client**.
   - Set the **Redirect URI**:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/battle-net
     ```
   - Note the **Client ID** and **Client Secret**.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `battle-net-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         // Battle.net does not provide email via OIDC by default
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'battletag' in claims then 'full' else null]: claims.battletag,
           [if 'sub' in claims && !('battletag' in claims) then 'full' else null]: 'BNet#' + claims.sub,
         },
       },
     },
   }
   ```

2. **Add Battle.net as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "battle-net",
       "provider": "generic",
       "client_id": "<your-battlenet-client-id>",
       "client_secret": "<your-battlenet-client-secret>",
       "issuer_url": "https://oauth.battle.net",
       "authorization_url": "https://oauth.battle.net/authorize",
       "token_url": "https://oauth.battle.net/token",
       "scope": ["openid"],
       "mapper_url": "base64://'"$(base64 < battle-net-mapper.jsonnet)"'"
     }'
   ```

   **Regional Endpoints:** Battle.net has region-specific OAuth endpoints:

   | Region | Authorization URL | Token URL |
   |--------|------------------|-----------|
   | US | `https://oauth.battle.net/authorize` | `https://oauth.battle.net/token` |
   | EU | `https://oauth.battle.net/authorize` | `https://oauth.battle.net/token` |
   | KR | `https://oauth.battle.net/authorize` | `https://oauth.battle.net/token` |
   | CN | `https://oauth.battlenet.com.cn/authorize` | `https://oauth.battlenet.com.cn/token` |

   For China, use `https://oauth.battlenet.com.cn` as the base URL.

3. **Enable the OIDC method:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/enabled=true'
   ```

## Technical Details

### OIDC Configuration

| Parameter | Value (Global) | Value (China) |
|-----------|---------------|---------------|
| Provider Type | `generic` (OIDC-compliant) | `generic` |
| Issuer URL | `https://oauth.battle.net` | `https://oauth.battlenet.com.cn` |
| Authorization URL | `https://oauth.battle.net/authorize` | `https://oauth.battlenet.com.cn/authorize` |
| Token URL | `https://oauth.battle.net/token` | `https://oauth.battlenet.com.cn/token` |
| User Info URL | `https://oauth.battle.net/userinfo` | `https://oauth.battlenet.com.cn/userinfo` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `openid` | OIDC ID token with `sub` and `battletag` |
| `wow.profile` | World of Warcraft character data |
| `sc2.profile` | StarCraft II profile data |
| `d3.profile` | Diablo III profile data |

### Claims from Battle.net

| Claim | Description |
|-------|-------------|
| `sub` | Unique Battle.net account ID (numeric) |
| `battletag` | BattleTag (e.g., `PlayerName#1234`) |

### Important Considerations

- **Limited user data:** Battle.net's OIDC userinfo only returns `sub` and `battletag`. No email, name, or profile picture is provided through the standard OIDC flow.
- **BattleTag as identifier:** The BattleTag is the primary user-facing identifier. It can be changed by users, so use `sub` as the stable identifier.
- **Regional considerations:** China has a separate Battle.net infrastructure (`battlenet.com.cn`).
- **Game-specific data:** To access game profiles (WoW characters, SC2 profiles, etc.), use the game-specific Blizzard APIs with additional scopes.
- **No email available:** Design your identity schema to work without email, or collect email separately during registration.

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
            "full": { "type": "string", "title": "BattleTag" }
          }
        },
        "battletag": {
          "type": "string",
          "title": "BattleTag"
        }
      }
    }
  }
}
```

### Jsonnet Claims Mapper (`battle-net-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'battletag' in claims then 'battletag' else null]: claims.battletag,
      name: {
        [if 'battletag' in claims then 'full' else null]: claims.battletag,
      },
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with a Battle.net account.
2. **Verify identity creation** with BattleTag.
3. **Test regional endpoints** if targeting specific regions.
4. **Note:** Email will not be available; ensure your schema and UI handle this gracefully.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Battle.net Developer Portal](https://develop.battle.net/)
- [Battle.net OAuth Documentation](https://develop.battle.net/documentation/guides/using-oauth)
- [Battle.net API Reference](https://develop.battle.net/documentation)
- [Battle.net OAuth Endpoints](https://develop.battle.net/documentation/guides/using-oauth/authorization-code-flow)
- [Ory Kratos Social Sign-In Overview](https://www.ory.sh/docs/kratos/social-signin/overview)
- [Ory Kratos Generic Provider Configuration](https://www.ory.sh/docs/kratos/social-signin/generic)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
