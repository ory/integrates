# Steam

> **Maintained by:** Community contributors
> **Status:** Community/proposed — not natively supported by Ory.

Steam by Valve uses **OpenID 2.0** (the legacy spec from 2007), not OAuth 2.0 or OIDC. Ory Kratos's social sign-in subsystem only speaks OAuth 2.0 / OIDC, so Steam **cannot be configured directly** as a Kratos provider. A bridge component is required.

**Type:** config (architectural pattern, not a turnkey provider)
**Docs page:** No dedicated Ory page (Steam is not natively supported).

## How to integrate Steam

Two viable approaches; pick based on whether you want to write a bridge or run one.

### Option 1 — OpenID 2.0 → OIDC proxy (recommended)

Deploy a small proxy that exposes an OIDC-compliant interface in front of Steam's OpenID 2.0 endpoint. Configure the proxy as a generic OIDC provider in Kratos. The proxy:

1. Receives the standard OIDC authorization request from Kratos.
2. Translates to Steam's OpenID 2.0 flow (`https://steamcommunity.com/openid/login`).
3. Validates the OpenID 2.0 response and extracts the 64-bit Steam ID from `openid.claimed_id`.
4. Calls the Steam Web API (`GetPlayerSummaries`) to fetch the user profile.
5. Returns an `id_token` to Kratos shaped as a normal OIDC response.

Then configure Kratos against the proxy's issuer URL with the [generic provider docs](https://www.ory.com/docs/kratos/social-signin/generic).

### Option 2 — Bypass Kratos's social sign-in entirely

Implement Steam OpenID 2.0 in your application backend, then create/look up the Ory identity via the [Kratos Admin API](https://www.ory.com/docs/kratos/reference/api) and mint an Ory session. This skips the social-signin subsystem but is more complex than Option 1.

## Steam-specific quirks to expect

- **No email is shared.** Design the identity schema to use `steam_id` as the credential identifier.
- **No client registration.** Steam doesn't issue Client ID/Secret — you only need a Steam Web API key (from [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)) to call the profile API after auth.
- **Profile visibility matters.** Some fields are blank when the user's Steam profile is private.
- **Rate limits.** Steam Web API allows ~100,000 calls/day per key.

## Resources

- [OpenID 2.0 spec](https://openid.net/specs/openid-authentication-2_0.html)
- [Steam Web API](https://developer.valvesoftware.com/wiki/Steam_Web_API)
- [Ory Kratos generic OIDC provider](https://www.ory.com/docs/kratos/social-signin/generic)

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
