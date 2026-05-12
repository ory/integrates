# TikTok

> **Maintained by:** Community contributors

Add Login with TikTok as a social sign-in provider in Ory Network. Useful for consumer media products, creator tools, and short-form video adjacent apps where TikTok is the audience graph.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/kratos/social-signin/generic](https://www.ory.com/docs/kratos/social-signin/generic) (no TikTok-specific page yet — TikTok configures cleanly as a generic OAuth2 provider)

## Setup

TikTok Login Kit uses a custom OAuth 2.0 flow (not OIDC). Configure as a generic provider with explicit endpoints. Short version:

1. Register a TikTok Developer app at the [TikTok for Developers portal](https://developers.tiktok.com/) and add **Login Kit** as a product.
2. Configure the Ory redirect URI as a Redirect URI in the app settings. Note the Client Key (Client ID) and Client Secret.
3. TikTok endpoints:
   - Authorization: `https://www.tiktok.com/v2/auth/authorize`
   - Token: `https://open.tiktokapis.com/v2/oauth/token/`
   - Profile: `https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name`
4. Configure as a generic provider via the Ory CLI (TikTok isn't OIDC so the Console wizard's discovery flow doesn't apply). Add Jsonnet mapping `data.user.open_id`, `data.user.display_name`, `data.user.email` if you've requested that scope.
5. TikTok requires explicit scope opt-in for `user.info.basic` and (separately) `user.info.email`.

## Status

Community/proposed — no dedicated Ory documentation yet. TikTok's app review may be required for production scopes. Contributions to ory/docs would be valued.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
