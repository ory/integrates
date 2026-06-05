# VKontakte (VK)

> **Maintained by:** Ory Engineering

Add VKontakte as a social sign-in provider in Ory Network. VK is the dominant Russian-language social network — the natural sign-in option for consumer products targeting Russia and CIS markets.

**Type:** config (Ory CLI configuration)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/vk](https://www.ory.com/docs/integrates-with/social-sign-in/vk) — full guide: [ory.com/docs/kratos/social-signin/vk](https://www.ory.com/docs/kratos/social-signin/vk)

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/vk). This provider is configured via the Ory CLI. Short version:

1. [Create a VK OAuth2 application](https://vk.com/apps?act=manage) and set the redirect URI to `https://$PROJECT_SLUG.projects.oryapis.com/self-service/methods/oidc/callback/vk`.
2. Note the App ID (Client ID) and Secure key (Client Secret).
3. Create a Jsonnet snippet mapping the desired claims (default returns email when present), base64-encode it.
4. Patch your Ory identity-config to add `provider: vk` with the credentials and mapper URL.

VK returns an `access_token` only — no `id_token` — so Ory calls VK's `users.get` API and surfaces the result as claims for Jsonnet mapping. VK doesn't expose an `email_verified` claim, so the default mapping is conservative.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
