# Lark / Feishu

> **Maintained by:** Ory Engineering

Add Lark (international) / Feishu (mainland China) as a social sign-in provider in Ory Network. Lark is ByteDance's enterprise communication platform — useful for B2B and APAC products that want sign-in via the workplace identity their users already have.

**Type:** config (Ory CLI configuration)
**Docs page:** [ory.com/docs/kratos/social-signin/lark](https://www.ory.com/docs/kratos/social-signin/lark)

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/lark). This provider is configured via the Ory CLI. Short version:

1. In the [Feishu Open Platform Developer Console](https://open.feishu.cn/app), create an application and note the App ID and App Secret.
2. Set the redirect URI to `https://$PROJECT_SLUG.projects.oryapis.com/self-service/methods/oidc/callback/lark`.
3. Create a Jsonnet snippet mapping the desired Lark user-info claims to your identity schema, base64-encode it.
4. Patch your Ory identity-config to add `provider: lark` with the credentials and the base64 mapper URL.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
