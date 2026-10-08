# Battle.net

> **Maintained by:** Community contributors

Add Battle.net (Blizzard) as a social sign-in provider in Ory Network. Useful for gaming products targeting Blizzard's player base — World of Warcraft, Overwatch, Hearthstone, Diablo, etc.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/battle-net](https://www.ory.com/docs/integrates-with/social-sign-in/battle-net)

## Setup

Battle.net supports OpenID Connect, so configure it as a [generic provider](https://www.ory.com/docs/kratos/social-signin/generic) in Ory. Short version:

1. Create a client at the [Battle.net Developer Portal](https://develop.battle.net/access/clients) and add the Ory redirect URI: `https://$PROJECT_SLUG.projects.oryapis.com/self-service/methods/oidc/callback/battle-net`. The last path segment is the provider ID that you set in Ory.
2. Copy the Client ID and Client Secret. The issuer URL is `https://oauth.battle.net`. For the China region, use `https://oauth.battlenet.com.cn` instead.
3. In the Ory Console, **Authentication → Social Sign-In → Add a Generic Provider**, or use the Ory CLI with `provider: generic`. Set Client ID, Client Secret, Issuer URL, and the `openid` scope.
4. Add a Jsonnet data mapping. Battle.net doesn't release email addresses. The ID token's `sub` claim is the user's numeric Battle.net account ID, and Ory passes every ID token claim to the mapping under `claims.raw_claims`:

   ```jsonnet
   local claims = std.extVar('claims');
   local raw = if 'raw_claims' in claims then claims.raw_claims else {};

   {
     identity: {
       traits: {
         battlenet_account_id: claims.sub,
         [if 'battle_tag' in raw then 'battletag' else null]: raw.battle_tag,
       },
     },
   }
   ```

   Your identity schema must define the `battlenet_account_id` and `battletag` traits and must not require an email address.
5. Save and trigger a registration flow to test.

## Status

This is a community/proposed integration without dedicated Ory documentation yet. Configuration follows the standard generic-OIDC pattern; if you ship it and would value a dedicated docs page, contributions to ory/docs are welcome.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
