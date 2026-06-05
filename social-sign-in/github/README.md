# GitHub

> **Maintained by:** Ory Engineering

Add GitHub as a social sign-in provider in Ory Network. GitHub doesn't implement OIDC, so Ory uses its OAuth2 flow and calls GitHub's User API to populate the claims envelope. Ideal for developer tools, DevOps platforms, and anything where most users already have a GitHub account.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/github](https://www.ory.com/docs/integrates-with/social-sign-in/github) — full guide: [ory.com/docs/kratos/social-signin/github](https://www.ory.com/docs/kratos/social-signin/github)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/github). Short version:

1. In [GitHub → Settings → Developer settings → OAuth Apps](https://github.com/settings/developers), click **New OAuth App** and paste the redirect URI from the Ory Console as the Authorization Callback URL.
2. Copy the Client ID and generate a new Client Secret, then paste both into the Ory Console form.
3. Add the `user:email` scope and the Jsonnet data-mapping snippet from the docs page (default maps the verified primary email to traits.email).
4. Save and trigger a registration flow to test.

For GitHub Apps (instead of OAuth Apps), use the Ory CLI variant on the docs page — the Console wizard supports OAuth Apps only.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
