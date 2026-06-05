# Battle.net

> **Maintained by:** Community contributors

Add Battle.net (Blizzard) as a social sign-in provider in Ory Network. Useful for gaming products targeting Blizzard's player base — World of Warcraft, Overwatch, Hearthstone, Diablo, etc.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/battle-net](https://www.ory.com/docs/integrates-with/social-sign-in/battle-net)

## Setup

Battle.net is OIDC-certified, so configure it as a generic OIDC provider in Ory. Full generic-provider walkthrough is at the docs page above. Short version:

1. Create a new client at the [Battle.net Developer Portal](https://develop.battle.net/access/clients) and add the redirect URI from the Ory Console.
2. Copy the Client ID and Client Secret. Note the regional issuer URL:
   - Americas: `https://oauth.battle.net`
   - Europe: `https://oauth.battle.net` (regional aliases exist; Battle.net does identity globally on the same issuer)
3. In the Ory Console, **Authentication → Social Sign-In → Add a Generic Provider**. Set Client ID, Client Secret, and Issuer URL.
4. Add the `openid` scope (and `wow.profile`, `sc2.profile` etc. if you want game-specific data) plus a Jsonnet snippet mapping the `sub`, `battle_tag`, `email` claims to your identity schema.
5. Save and trigger a registration flow to test.

## Status

This is a community/proposed integration without dedicated Ory documentation yet. Configuration follows the standard generic-OIDC pattern; if you ship it and would value a dedicated docs page, contributions to ory/docs are welcome.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
