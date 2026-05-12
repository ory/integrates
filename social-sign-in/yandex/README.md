# Yandex

> **Maintained by:** Ory Engineering

Add Yandex as a social sign-in provider in Ory Network. Yandex is the dominant Russian search and services portal — common for products serving Russian-language consumers and CIS markets.

**Type:** config (Ory CLI configuration)
**Docs page:** [ory.com/docs/kratos/social-signin/yandex](https://www.ory.com/docs/kratos/social-signin/yandex)

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/yandex). This provider is configured via the Ory CLI. Short version:

1. [Create a Yandex OAuth2 application](https://yandex.com/dev/id/doc/en/register-client) and set the redirect URI to `https://$PROJECT_SLUG.projects.oryapis.com/self-service/methods/oidc/callback/yandex`.
2. Note the Client ID and Client Secret.
3. Create a Jsonnet snippet mapping the desired claims (default returns email when present), base64-encode it.
4. Patch your Ory identity-config to add `provider: yandex` with the credentials, mapper URL, and the `email` scope.

Yandex returns an `access_token` only — no `id_token` — so Ory calls Yandex's user-info API and surfaces the result as claims for Jsonnet mapping.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
