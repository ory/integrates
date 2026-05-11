# Sign in with TikTok — Ory Network Integration

> **Maintained by:** Ory Engineering

## Overview

TikTok is one of the largest short-video platforms globally with strong reach in younger demographics. The TikTok Login Kit exposes a standard OAuth 2.0 / OIDC-style flow that Ory Kratos can consume as a generic OIDC provider, giving customers a frictionless sign-in for TikTok's user base.

## How it works

```
User → Ory Login UI → Ory Kratos (OIDC, "tiktok" provider)
                          ↓
                    TikTok Authorization
                    (https://www.tiktok.com/v2/auth/authorize/)
                          ↓
                    User consents
                          ↓
                    TikTok Token Endpoint
                    (https://open.tiktokapis.com/v2/oauth/token/)
                          ↓
                    TikTok Userinfo
                    (https://open.tiktokapis.com/v2/user/info/)
                          ↓
                    Ory Kratos creates / updates identity
                          ↓
                    User redirected to application
```

## Prerequisites

1. **Ory Network account** — sign up at [console.ory.sh](https://console.ory.sh).
2. **TikTok for Developers app** — create at [developers.tiktok.com](https://developers.tiktok.com/).
   - Add the **Login Kit** product to the app.
   - Set the redirect URI to:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/tiktok
     ```
   - Note the **Client Key** and **Client Secret**.
3. Submit the app for TikTok review if you need anything beyond the basic `user.info.basic` scope — TikTok requires app review for `email`, `profile`, and other scopes.

## Configuration

Save a Jsonnet claims mapper as `tiktok-mapper.jsonnet`:

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      [if 'display_name' in claims then 'name' else null]: claims.display_name,
      [if 'avatar_url' in claims then 'picture' else null]: claims.avatar_url,
    },
  },
}
```

Add TikTok via the Ory CLI:

```bash
ory patch identity-config \
  --project <your-project-id> \
  --workspace <your-workspace-id> \
  --add '/selfservice/methods/oidc/config/providers/-={
    "id": "tiktok",
    "provider": "generic",
    "issuer_url": "https://www.tiktok.com/",
    "auth_url": "https://www.tiktok.com/v2/auth/authorize/",
    "token_url": "https://open.tiktokapis.com/v2/oauth/token/",
    "client_id": "<tiktok-client-key>",
    "client_secret": "<tiktok-client-secret>",
    "scope": ["user.info.basic", "user.info.profile", "user.info.email"],
    "mapper_url": "base64://'"$(base64 < tiktok-mapper.jsonnet)"'"
  }'
```

## Technical details

| Field | Value |
|---|---|
| Authorization URL | `https://www.tiktok.com/v2/auth/authorize/` |
| Token URL | `https://open.tiktokapis.com/v2/oauth/token/` |
| Userinfo URL | `https://open.tiktokapis.com/v2/user/info/` |
| Common scopes | `user.info.basic`, `user.info.profile`, `user.info.email`, `user.info.stats` |

## Notes

- TikTok's claim names differ from canonical OIDC (`open_id` instead of `sub`, `display_name` instead of `name`). The mapper above normalizes them.
- TikTok requires HTTPS redirect URIs even for testing.
- App review is required for any scope beyond `user.info.basic`; plan timelines accordingly.

## Resources

- [TikTok Login Kit](https://developers.tiktok.com/doc/login-kit-web)
- [TikTok user info v2](https://developers.tiktok.com/doc/tiktok-api-v2-user-info)
- [Ory generic OIDC provider docs](https://www.ory.com/docs/kratos/social-signin/generic)
