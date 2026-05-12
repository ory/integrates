# Naver

> **Maintained by:** Community contributors

Add Naver Login as a social sign-in provider in Ory Network. Naver is South Korea's largest search portal — a complementary sign-in option to Kakao for products targeting Korean users.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/kratos/social-signin/generic](https://www.ory.com/docs/kratos/social-signin/generic) (no Naver-specific page yet — Naver is OAuth 2.0 and configures as a generic provider)

## Setup

Naver supports OAuth 2.0 (not OIDC) — Ory calls Naver's profile API to populate claims. Configure as a generic OAuth provider. Short version:

1. Register a Naver Login application at the [Naver Developers Console](https://developers.naver.com/apps/) and add the redirect URI from the Ory Console.
2. Note the Client ID and Client Secret. Naver's authorization endpoint is `https://nid.naver.com/oauth2.0/authorize`, token endpoint `https://nid.naver.com/oauth2.0/token`, profile endpoint `https://openapi.naver.com/v1/nid/me`.
3. Configure as a generic provider in the Ory Console (or via CLI). Because Naver isn't OIDC, you'll need to use the CLI variant with explicit auth/token URLs rather than the Console wizard.
4. Add a Jsonnet snippet mapping the Naver claims (`response.id`, `response.email`, `response.nickname`) to your identity schema.

## Status

Community/proposed — no dedicated Ory documentation yet. Naver isn't OIDC (no discovery URL), so the integration requires explicit auth/token endpoints in the provider config. Contributions to ory/docs would be valued.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
