# WeChat

> **Maintained by:** Community contributors
> **Status:** Community/proposed — not natively supported by Ory.

WeChat (微信) is the dominant Chinese super-app. WeChat's "OAuth" flow is **non-standard**: it uses `appid`/`secret` instead of `client_id`/`client_secret`, has separate authorization endpoints for web QR-code login vs in-app, and never returns an `id_token`. Kratos's stock OIDC and OAuth2 providers won't work directly without help.

**Type:** config (architectural pattern, not a turnkey provider)
**Docs page:** No dedicated Ory page (WeChat is not natively supported).

## How to integrate WeChat

### Recommended — proxy that exposes a standard OIDC interface

Stand up a small bridge in front of WeChat that:

1. Accepts the standard OIDC authorization request from Kratos.
2. Translates the parameters (`client_id` → `appid`, etc.) and forwards to WeChat's authorization endpoint.
3. Validates WeChat's response, calls `/sns/userinfo`, and returns a normal OIDC `id_token` to Kratos.

Then configure Kratos against the proxy as a [generic OIDC provider](https://www.ory.com/docs/kratos/social-signin/generic).

### Without a proxy

You can configure Kratos's `provider: generic` against WeChat's URLs directly, but parameter renaming and the missing `id_token` mean you'll need to override Kratos's userinfo behavior — usually impractical without the proxy above.

## WeChat-specific quirks to expect

- **No email is shared.** WeChat never returns an email; design the identity schema accordingly (use `unionid` or `openid` as the credential identifier).
- **`unionid` vs `openid`.** `openid` is per-app; `unionid` identifies the same user across all apps under one Open Platform account. Prefer `unionid`.
- **Separate flows per surface.** Web uses QR code login at `https://open.weixin.qq.com/connect/qrconnect`; in-app uses `/connect/oauth2/authorize`; Mini Programs use yet another flow.
- **Chinese business entity required.** Registering on the WeChat Open Platform requires a Chinese business license; for web apps, an ICP filing is required for the callback domain.
- **Connectivity from outside China** is unreliable; test from within China.

## Resources

- [WeChat OAuth web login](https://developers.weixin.qq.com/doc/oplatform/en/Website_App/WeChat_Login/Wechat_Login.html)
- [WeChat UnionID mechanism](https://developers.weixin.qq.com/doc/offiaccount/User_Management/Get_users_basic_information_UnionId_.html)
- [Ory Kratos generic OIDC provider](https://www.ory.com/docs/kratos/social-signin/generic)

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
