# Kakao

> **Maintained by:** Community contributors

Add Kakao Login as a social sign-in provider in Ory Network. Kakao is the dominant identity and messaging platform in South Korea — the natural sign-in option for consumer products targeting Korean users.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/kratos/social-signin/generic](https://www.ory.com/docs/kratos/social-signin/generic) (no Kakao-specific page yet — Kakao is OIDC-compliant and configures cleanly as a generic OIDC provider)

## Setup

Kakao supports OIDC. Configure as a generic provider in Ory. Short version:

1. Create a Kakao application at the [Kakao Developers Console](https://developers.kakao.com/) and enable Kakao Login.
2. Add the redirect URI from the Ory Console under **Product Settings → Kakao Login → Redirect URI**.
3. Note the REST API key (Client ID) and the Client Secret (must be enabled separately under **Security**). Issuer URL: `https://kauth.kakao.com`.
4. In the Ory Console, **Authentication → Social Sign-In → Add a Generic Provider**. Set Client ID, Client Secret, and Issuer URL.
5. Add the `openid`, `profile_nickname`, `account_email` scopes plus a Jsonnet snippet mapping the Kakao claims (`sub`, `nickname`, `email`) to your identity schema.

## Status

Community/proposed — no dedicated Ory documentation yet. Kakao is OIDC-certified so the generic provider works; if you ship this, contributions to ory/docs would be valued.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
