# UAE PASS

> **Maintained by:** Ory Engineering

Add UAE PASS as a social sign-in provider in Ory Network. UAE PASS is the United Arab Emirates' official digital identity platform — required for products serving UAE residents and the natural choice for any consumer app operating in the UAE.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/uaepass](https://www.ory.com/docs/integrates-with/social-sign-in/uaepass) — full guide: [ory.com/docs/kratos/social-signin/uaepass](https://www.ory.com/docs/kratos/social-signin/uaepass)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/uaepass). Short version:

1. Register your application on the [UAE PASS partner portal](https://uaepass.ae/) and obtain a Client ID and Client Secret. UAE PASS onboarding is gated and requires partner approval.
2. In the Ory Console, enable **OpenID Connect** under Social Sign-In, click **Add new OpenID Connect provider**, and choose UAE PASS.
3. Paste Client ID, Client Secret, and the **Issuer URL** (`https://id.uaepass.ae` for production, `https://stg-id.uaepass.ae` for staging) into the Ory Console form.
4. Add the Jsonnet data-mapping snippet from the docs page (default maps `sub` → `subject`, `email` → `email`, `fullnameEN` → `name`).
5. Add `https://$PROJECT_SLUG.projects.oryapis.com/self-service/methods/oidc/callback` to UAE PASS's allowed redirect URIs in the partner portal. Ory always uses PKCE with UAE PASS unless you set `pkce: never`, and with PKCE the redirect URI has no provider ID. With `pkce: never`, register `https://$PROJECT_SLUG.projects.oryapis.com/self-service/methods/oidc/callback/<provider-id>` instead.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
