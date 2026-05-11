# Steam Login - Ory Network Integration

> **Status: Community/Proposed** — This integration does not have official Ory documentation. Steam uses **OpenID 2.0** (legacy), NOT OAuth 2.0 or OIDC, which requires special handling.

## Overview

Steam by Valve is the world's largest PC gaming platform with over 130 million monthly active users. Steam Login is essential for gaming platforms, game launchers, community sites, and esports applications. Unlike modern social login providers, Steam uses the legacy **OpenID 2.0** protocol rather than OAuth 2.0 or OIDC, which means it cannot be directly configured as an OIDC provider in Ory Kratos.

## Integration Architecture

Because Steam uses OpenID 2.0 (not OAuth 2.0/OIDC), a middleware layer is required to bridge the protocol gap.

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Your Application / Middleware
  (Handles OpenID 2.0 <-> OIDC bridge)
       |
       v
  Steam OpenID 2.0 Endpoint
  (https://steamcommunity.com/openid/login)
       |
       v
  Steam Login Page
       |
       v
  Steam OpenID 2.0 Response
  (Returns Steam ID via claimed_id)
       |
       v
  Middleware fetches Steam profile
  (https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/)
       |
       v
  Middleware creates/updates Ory identity via Admin API
       |
       v
  User redirected to application
```

### Why a Middleware Is Required

Steam's OpenID 2.0 protocol is fundamentally different from OAuth 2.0/OIDC:

| Feature | OAuth 2.0 / OIDC | Steam OpenID 2.0 |
|---------|-------------------|-------------------|
| Protocol | OAuth 2.0 / OpenID Connect | OpenID 2.0 (legacy) |
| Token exchange | Authorization code -> access token | No tokens; direct assertion |
| User info | Userinfo endpoint or ID token | Separate Steam Web API call |
| Client credentials | Client ID + Secret | No client registration |
| Scopes | Granular scope control | No scopes |
| State parameter | Built-in CSRF protection | Manual implementation needed |

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management (via Admin API for identity creation) |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **Steam Web API Key** — Obtain at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey):
   - Requires a Steam account with a purchased game.
   - The API key is used to fetch user profiles after OpenID authentication.
3. **Middleware/Proxy Service** — Implement or deploy a service that:
   - Handles Steam OpenID 2.0 authentication.
   - Fetches user profile from Steam Web API.
   - Creates/links identities in Ory Kratos via the Admin API.

## Configuration

### Approach 1: Custom Middleware (Recommended)

Since Steam cannot be used as a native OIDC provider in Kratos, build a middleware that:

1. **Initiates Steam OpenID 2.0 login:**
   ```
   GET https://steamcommunity.com/openid/login
     ?openid.ns=http://specs.openid.net/auth/2.0
     &openid.mode=checkid_setup
     &openid.return_to=https://your-app.com/auth/steam/callback
     &openid.realm=https://your-app.com/
     &openid.identity=http://specs.openid.net/auth/2.0/identifier_select
     &openid.claimed_id=http://specs.openid.net/auth/2.0/identifier_select
   ```

2. **Validates the OpenID 2.0 response** by calling Steam's verification endpoint.

3. **Extracts the Steam ID** from the `openid.claimed_id` parameter:
   ```
   https://steamcommunity.com/openid/id/76561198012345678
   ```
   The Steam ID is the numeric suffix: `76561198012345678`.

4. **Fetches the user profile** from the Steam Web API:
   ```
   GET https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/
     ?key=YOUR_STEAM_API_KEY
     &steamids=76561198012345678
   ```

5. **Creates or updates the Ory identity** via the Admin API:
   ```bash
   curl -X POST "https://{your-project-slug}.projects.oryapis.com/admin/identities" \
     -H "Authorization: Bearer {ory-api-key}" \
     -H "Content-Type: application/json" \
     -d '{
       "schema_id": "default",
       "traits": {
         "steam_id": "76561198012345678",
         "name": { "full": "PlayerName" },
         "picture": "https://avatars.steamstatic.com/..."
       }
     }'
   ```

6. **Creates an Ory session** for the user and redirects to the application.

### Approach 2: OpenID 2.0 to OIDC Proxy

Deploy an OpenID 2.0 to OIDC proxy service that wraps Steam authentication in an OIDC-compliant interface, then configure it as a generic OIDC provider in Kratos. Open-source options include community-maintained Steam OIDC bridges.

```bash
ory patch identity-config \
  --project <your-project-id> \
  --workspace <your-workspace-id> \
  --add '/selfservice/methods/oidc/config/providers/-={
    "id": "steam",
    "provider": "generic",
    "client_id": "steam-proxy-client-id",
    "client_secret": "steam-proxy-client-secret",
    "issuer_url": "https://your-steam-oidc-proxy.example.com",
    "scope": ["openid", "profile"],
    "mapper_url": "base64://'"$(base64 < steam-mapper.jsonnet)"'"
  }'
```

## Technical Details

### Steam OpenID 2.0 Endpoints

| Parameter | Value |
|-----------|-------|
| OpenID 2.0 Endpoint | `https://steamcommunity.com/openid/login` |
| Discovery URL | `https://steamcommunity.com/openid/` |
| Steam Web API | `https://api.steampowered.com/` |
| Player Summaries | `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/` |

### Steam Profile Data

The Steam Web API `GetPlayerSummaries` returns:

| Field | Description |
|-------|-------------|
| `steamid` | 64-bit Steam ID |
| `personaname` | Display name |
| `profileurl` | Profile URL |
| `avatar` | 32x32 avatar URL |
| `avatarmedium` | 64x64 avatar URL |
| `avatarfull` | 184x184 avatar URL |
| `personastate` | Online status (0=Offline, 1=Online, ...) |
| `communityvisibilitystate` | Profile visibility (1=Private, 3=Public) |
| `realname` | Real name (if public) |
| `loccountrycode` | Country code |
| `locstatecode` | State code |
| `loccityid` | City ID |
| `timecreated` | Account creation time (Unix timestamp) |

### Critical Considerations

- **No email provided:** Steam does not share user email addresses through OpenID 2.0 or the Web API. Design your identity schema to work without email.
- **No OAuth 2.0 / OIDC:** Steam only supports OpenID 2.0, requiring a middleware or proxy.
- **Steam ID is the only identifier:** The 64-bit Steam ID is the sole identifier returned from OpenID authentication.
- **Profile visibility:** Some profile data is only available if the user's profile is public.
- **API key required:** The Steam Web API key is needed to fetch user profiles after authentication.
- **Rate limits:** The Steam Web API has rate limits of approximately 100,000 requests per day per API key.

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
        "steam_id": {
          "type": "string",
          "title": "Steam ID",
          "ory.sh/kratos": {
            "credentials": {
              "password": { "identifier": true }
            }
          }
        },
        "email": {
          "type": "string",
          "format": "email",
          "title": "Email"
        },
        "name": {
          "type": "object",
          "properties": {
            "full": { "type": "string", "title": "Display Name" }
          }
        },
        "picture": {
          "type": "string",
          "title": "Avatar URL"
        }
      },
      "required": ["steam_id"]
    }
  }
}
```

### Jsonnet Claims Mapper (`steam-mapper.jsonnet`)

For use with an OIDC proxy that normalizes Steam data:

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'sub' in claims then 'steam_id' else null]: claims.sub,
      name: {
        [if 'name' in claims then 'full' else null]: claims.name,
        [if 'personaname' in claims then 'full' else null]: claims.personaname,
      },
      [if 'picture' in claims then 'picture' else null]: claims.picture,
      [if 'avatarfull' in claims then 'picture' else null]: claims.avatarfull,
    },
  },
}
```

## Testing

1. **Test with the Steam login page** — verify that the OpenID 2.0 flow redirects correctly.
2. **Verify Steam ID extraction** from the `claimed_id` URL.
3. **Test profile data retrieval** from the Steam Web API.
4. **Test with private profiles** — verify graceful handling when profile data is limited.
5. **Verify identity creation** in Ory:

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Steam OpenID 2.0](https://steamcommunity.com/dev)
- [Steam Web API Documentation](https://developer.valvesoftware.com/wiki/Steam_Web_API)
- [Steam Web API Key Registration](https://steamcommunity.com/dev/apikey)
- [GetPlayerSummaries API](https://developer.valvesoftware.com/wiki/Steam_Web_API#GetPlayerSummaries_.28v0002.29)
- [OpenID 2.0 Specification](https://openid.net/specs/openid-authentication-2_0.html)
- [Ory Kratos Admin API - Identities](https://www.ory.sh/docs/kratos/reference/api#tag/identity)
- [Ory Kratos Social Sign-In Overview](https://www.ory.sh/docs/kratos/social-signin/overview)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
