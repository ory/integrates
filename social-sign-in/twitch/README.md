# Twitch

> **Maintained by:** Ory Engineering

Add Log in with Twitch as a social sign-in provider in Ory Network. Common in gaming, streaming, and creator-tooling products targeting Twitch's audience and content creators.

**Type:** config (Ory CLI configuration)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/twitch](https://www.ory.com/docs/integrates-with/social-sign-in/twitch) — full guide: [ory.com/docs/kratos/social-signin/twitch](https://www.ory.com/docs/kratos/social-signin/twitch)

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/twitch). This provider is configured via the Ory CLI. Short version:

1. [Create a Twitch OAuth2 application](https://dev.twitch.tv/docs/authentication#registration) and set the redirect URI to `https://$PROJECT_SLUG.projects.oryapis.com/self-service/methods/oidc/callback/twitch`.
2. Note the Client ID and Client Secret.
3. Create a Jsonnet snippet mapping the desired claims (default returns email when `email_verified` is true), base64-encode it.
4. Patch your Ory identity-config to add the provider with the credentials, mapper URL, and required scopes. Twitch is **not** a first-party Kratos provider — configure it as `provider: generic` with `issuer_url: https://id.twitch.tv/oauth2`, and set `id: twitch` (the `id` is what appears in the callback URL above).

Twitch publishes an OIDC discovery URL but doesn't support the `openid` claim and returns only an `access_token` — Ory calls Twitch's `/me` API and surfaces the user info as claims for Jsonnet mapping. Because email and `email_verified` aren't returned by default, request them explicitly via `requested_claims.id_token` and the `user:read:email` scope.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
