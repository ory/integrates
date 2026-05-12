# Epic Games

> **Maintained by:** Community contributors

Add Epic Games as a social sign-in provider in Ory Network. Useful for products targeting Fortnite, Rocket League, and Unreal-engine games — Epic Online Services (EOS) is the OAuth provider behind Epic Games accounts.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/kratos/social-signin/generic](https://www.ory.com/docs/kratos/social-signin/generic) (no Epic-specific page yet — Epic configures cleanly as a generic OIDC / OAuth2 provider)

## Setup

Epic supports OAuth 2.0 via Epic Online Services. Configure as a generic provider in Ory. Short version:

1. Create an Epic Games product in the [Epic Games Developer Portal](https://dev.epicgames.com/portal/) and provision an EOS application client.
2. Configure the redirect URI from the Ory Console as an allowed redirect URI on the Epic client.
3. Note the Client ID and Client Secret. Epic's OAuth issuer is `https://api.epicgames.dev/epic/oauth/v2`.
4. In the Ory Console, **Authentication → Social Sign-In → Add a Generic Provider**. Set Client ID, Client Secret, and Issuer URL.
5. Add the `basic_profile` and `openid` scopes plus a Jsonnet snippet mapping the Epic claims (`sub` = Epic Account ID, `preferred_username`, `email`) to your identity schema.

## Status

Community/proposed — no dedicated Ory documentation yet. Configuration follows the generic-OIDC pattern. If you ship this, contributions to ory/docs would be valued.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
