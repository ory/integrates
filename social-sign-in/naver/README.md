# Naver

> **Maintained by:** Community contributors

Add Naver Login as a social sign-in provider in Ory Network. Naver is South Korea's largest search portal — a complementary sign-in option to Kakao for products targeting Korean users.

**Type:** config (architectural pattern, not a turnkey provider)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/naver](https://www.ory.com/docs/integrates-with/social-sign-in/naver)

## Setup

Ory has no built-in Naver provider, and the [generic provider](https://www.ory.com/docs/kratos/social-signin/generic) works only with OpenID Connect providers: it reads the endpoints from the provider's discovery document and the user's claims from the ID token. It doesn't accept explicit authorization, token, or profile endpoints.

Naver Login's classic API (`https://nid.naver.com/oauth2.0/...`) is OAuth 2.0 only. It returns no ID token, and the profile comes from a separate API (`https://openapi.naver.com/v1/nid/me`) as `response.id`, `response.email`, and `response.nickname`. You can't configure this API in Ory directly.

Naver also publishes an OpenID Connect discovery document at `https://nid.naver.com/.well-known/openid-configuration`, and Ory resolves it for a generic provider with the issuer URL `https://nid.naver.com`. Check whether your Naver app can sign in through these endpoints before you build a bridge.

### OAuth 2.0 to OIDC bridge

To use the classic API, run a bridge that acts as an OpenID Connect provider toward Ory, the same pattern as the [Steam](../steam/) and [WeChat](../wechat/) entries describe. Ory doesn't provide this bridge: you build and operate it.

The bridge receives the authorization request from Ory, sends the user to Naver's authorization endpoint, exchanges the code at Naver's token endpoint, calls Naver's profile API, and returns an ID token built from the profile to Ory. Configure the bridge as a generic provider in Ory.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
