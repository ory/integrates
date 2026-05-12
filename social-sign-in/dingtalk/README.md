# DingTalk

> **Maintained by:** Ory Engineering

Add DingTalk (钉钉) as a social sign-in provider in Ory Network. DingTalk is Alibaba's enterprise communication platform — common for mainland-China and APAC enterprise products that want sign-in via the workplace identity their users already have.

**Type:** config (Ory CLI configuration)
**Docs page:** [ory.com/docs/kratos/social-signin/dingtalk](https://www.ory.com/docs/kratos/social-signin/dingtalk)

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/dingtalk). This provider is configured via the Ory CLI (no Console wizard yet). Short version:

1. [Create a DingTalk OAuth app](https://open-dev.dingtalk.com/fe/app#/corp/app) and set the redirect URI to `https://$PROJECT_SLUG.projects.oryapis.com/self-service/methods/oidc/callback/dingtalk`.
2. Note the Client ID and Client Secret.
3. Create a Jsonnet snippet mapping the desired DingTalk user-info claims to your identity schema, base64-encode it.
4. Patch your Ory identity-config to add `provider: dingtalk` with the credentials, the base64 mapper URL, and the `openid` (or `openid corpid`) scope.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
