# TikTok

> **Maintained by:** Community contributors

Add Login with TikTok as a social sign-in provider in Ory Network. Useful for consumer media products, creator tools, and short-form video adjacent apps where TikTok is the audience graph.

**Type:** config (architectural pattern, not a turnkey provider)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/tiktok](https://www.ory.com/docs/integrates-with/social-sign-in/tiktok)

## Setup

TikTok Login Kit uses a custom OAuth 2.0 flow, not OpenID Connect. It publishes no discovery document, returns no ID token, and expects a `client_key` parameter instead of `client_id`. The profile comes from a separate user info API.

Ory has no built-in TikTok provider, and the [generic provider](https://www.ory.com/docs/kratos/social-signin/generic) works only with OpenID Connect providers: it reads the endpoints from the provider's discovery document and the user's claims from the ID token. You can't configure TikTok in Ory directly.

### OAuth 2.0 to OIDC bridge

Run a bridge that acts as an OpenID Connect provider toward Ory, the same pattern as the [Steam](../steam/) and [WeChat](../wechat/) entries describe. Ory doesn't provide this bridge: you build and operate it. Then configure the bridge as a generic provider in Ory.

The bridge receives the authorization request from Ory, sends the user to TikTok's authorization endpoint, exchanges the code at TikTok's token endpoint, calls TikTok's user info API, and returns an ID token built from the profile to Ory. Register the bridge's callback URL in the TikTok app, and register Ory's redirect URI with the bridge.

TikTok endpoints the bridge calls:

- Authorization: `https://www.tiktok.com/v2/auth/authorize/`
- Token: `https://open.tiktokapis.com/v2/oauth/token/`
- User info: `https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name`

### TikTok-specific details

- **Scopes.** The `user.info.basic` scope covers the user's open ID, avatar, and display name. Production scopes can require app review.
- **No email.** TikTok's scope list has no scope for the user's email address. Use `open_id` or `union_id` as the identifier in the identity schema.

## Status

Community/proposed. Ory doesn't provide the bridge. Contributions to ory/docs would be valued.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
