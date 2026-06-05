# LinkedIn

> **Maintained by:** Ory Engineering

Add Sign In with LinkedIn as a social sign-in provider in Ory Network. LinkedIn migrated to OIDC-compliant authentication via its "Sign In with LinkedIn using OpenID Connect" product, returning standard `email`, `name`, and `picture` claims so the mapping is straightforward.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/linkedin](https://www.ory.com/docs/integrates-with/social-sign-in/linkedin) — full guide: [ory.com/docs/kratos/social-signin/linkedin](https://www.ory.com/docs/kratos/social-signin/linkedin)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/linkedin). Short version:

1. In the [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps), create a new app and add the **Sign In with LinkedIn using OpenID Connect** product. Add the redirect URI from the Ory Console under **Auth → Authorized redirect URLs**.
2. Copy the Client ID and Client Secret into the Ory Console's LinkedIn form.
3. Add the `openid`, `email`, `profile` scopes and the Jsonnet data-mapping snippet from the docs page.
4. Save and trigger a registration flow to test.

LinkedIn's older `r_liteprofile`/`r_emailaddress` (v2) flow is deprecated — use the OIDC product, not the legacy one.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
