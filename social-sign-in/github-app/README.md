# GitHub App

> **Maintained by:** Ory Engineering

Sign in with a **GitHub App** (not the older OAuth Apps flow). GitHub Apps offer fine-grained, per-repository permissions, per-installation rate limits, and JWT-based server-to-server authentication for acting as the app itself. Use this variant when your product needs to act on a GitHub installation's behalf — read repos, open PRs, post checks — in addition to identifying the user.

**Type:** config (Ory CLI configuration; no webhook code in this directory)
**Docs page:** [ory.com/docs/kratos/social-signin/github](https://www.ory.com/docs/kratos/social-signin/github)

This is a **variant of the standard GitHub provider** — the OIDC flow is identical (Ory uses `provider: github` under a different `id`), but on the GitHub side you register a **GitHub App** instead of an OAuth App so you also get installation tokens.

## Setup

1. Follow the [Ory docs page](https://www.ory.com/docs/kratos/social-signin/github) for the **base GitHub provider configuration**, but at the GitHub side create a **GitHub App** at [github.com/settings/apps/new](https://github.com/settings/apps/new) instead of an OAuth App:
   - Set the **Callback URL** to the Ory redirect URI (`https://$PROJECT_SLUG.projects.oryapis.com/self-service/methods/oidc/callback/github-app`).
   - Enable **Request user authorization (OAuth) during installation**.
   - Configure the **Permissions** the app needs (e.g. repository contents, pull requests).
   - Generate and download a **Private Key** (`.pem`) — used later for server-to-server JWTs, not for Ory.
   - Note the **App ID**, **Client ID**, **Client Secret**.
2. Configure the provider via Ory CLI with `provider: github` and `id: github-app`. The `id` is what appears in the redirect URI; the `provider` tells Kratos which OAuth grammar to use.
3. **Server-to-server** (acting as the app itself) is **out of scope for the Ory provider** — your application code mints a JWT signed with the `.pem` key and exchanges it at `POST /app/installations/{installation_id}/access_tokens` for an installation token. Ory only handles user identification.

## When to choose this over the regular `github` provider

| | OAuth App (`github`) | GitHub App (this) |
|--|--|--|
| Permissions | Broad scopes | Fine-grained, per-repo |
| Rate limits | 5,000/hr per user | 5,000/hr per installation |
| Server-to-server | Not supported | JWT-based |
| Webhooks | Limited | Rich events |

If you only need user login, the regular `github` provider is simpler.

## Resources

- [GitHub Apps documentation](https://docs.github.com/en/apps/creating-github-apps)
- [Authenticating with a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app)

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
