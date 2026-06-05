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
4. Patch your Ory identity-config to add `provider: twitch` with the credentials, mapper URL, and required scopes.

Twitch publishes an OIDC discovery URL but doesn't return an `id_token` — Ory calls Twitch's `/me` API and surfaces the user info as claims for Jsonnet mapping.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
