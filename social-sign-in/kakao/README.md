# Kakao

> **Maintained by:** Community contributors

Add Kakao Login as a social sign-in provider in Ory Network. Kakao is the dominant identity and messaging platform in South Korea — the natural sign-in option for consumer products targeting Korean users.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/kakao](https://www.ory.com/docs/integrates-with/social-sign-in/kakao)

## Setup

Kakao Login supports OpenID Connect, so configure it as a [generic provider](https://www.ory.com/docs/kratos/social-signin/generic) in Ory. Short version:

1. Create an app in the [Kakao Developers console](https://developers.kakao.com/console/app). Note the **REST API key**, which is the client ID, and the **client secret** of that key. Ory requires the client secret.
2. Turn on **Kakao Login** and **OpenID Connect** for the app.
3. Register the Ory redirect URI for the REST API key: `https://$PROJECT_SLUG.projects.oryapis.com/self-service/methods/oidc/callback/kakao`. The last path segment is the provider ID that you set in Ory.
4. Configure the consent items you need: `profile_nickname`, `profile_image`, and `account_email`. Kakao can require additional permissions, such as business verification, before you can use some consent items.
5. In the Ory Console, **Authentication → Social Sign-In → Add a Generic Provider**, or use the Ory CLI with `provider: generic`. Set Client ID, Client Secret, Issuer URL `https://kauth.kakao.com`, and the scopes `openid`, `profile_nickname`, `profile_image`, and `account_email`.
6. Add a Jsonnet data mapping. Kakao's ID token contains `sub`, and `nickname`, `picture`, and `email` when the user consents to the matching consent items. It has no `email_verified` claim. This mapping copies the email address to the `email` trait when Kakao returns one:

   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
       },
     },
   }
   ```

## Status

Community/proposed — no dedicated Ory documentation yet. Kakao is OIDC-certified so the generic provider works; if you ship this, contributions to ory/docs would be valued.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
