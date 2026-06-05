# GitLab

> **Maintained by:** Ory Engineering

Add GitLab as a social sign-in provider in Ory Network. GitLab is OIDC-compliant natively — both GitLab.com and self-managed instances expose `/.well-known/openid-configuration`. Ideal for DevOps tools, CI/CD dashboards, and any developer-facing app whose users likely already have a GitLab account.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/gitlab](https://www.ory.com/docs/integrates-with/social-sign-in/gitlab) — full guide: [ory.com/docs/kratos/social-signin/gitlab](https://www.ory.com/docs/kratos/social-signin/gitlab)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/gitlab). Short version:

1. In [GitLab → User Settings → Applications](https://gitlab.com/-/user_settings/applications) (or your self-managed instance's admin area), create a new application:
   - Redirect URI: from the Ory Console.
   - Scopes: `openid`, `email`, `profile`, `read_user`.
2. Copy the Application ID (Client ID) and Secret (Client Secret) into the Ory Console's GitLab form.
3. For self-managed GitLab, set the issuer URL to your instance (the Ory CLI flow has a `issuer_url` field; the Console wizard defaults to gitlab.com).
4. Add the Jsonnet data-mapping snippet from the docs page.
5. Save and trigger a registration flow to test.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
