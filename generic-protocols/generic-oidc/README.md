# Generic OIDC Provider

> **Maintained by:** Ory Engineering

Configure any OpenID Connect-compliant Identity Provider with Ory. OIDC shows up in two Ory product surfaces:

- **Ory Kratos social sign-in / federated sign-in** — for consumer or user-facing sign-in flows. Kratos is the OIDC Relying Party.
- **Ory Polis enterprise SSO** — for B2B SSO with per-organization isolation. Polis is the OIDC Relying Party on behalf of an organization.

> Same source page as [`enterprise-sso/generic-oidc`](../../enterprise-sso/generic-oidc/) — categorization choice.

**Type:** config (no webhook code)
**Docs page:** [ory.com/docs/integrates-with/generic-protocols/generic-oidc](https://www.ory.com/docs/integrates-with/generic-protocols/generic-oidc)
- Kratos generic OIDC: [ory.com/docs/kratos/social-signin/generic](https://www.ory.com/docs/kratos/social-signin/generic)
- Polis generic OIDC: [ory.com/docs/polis/sso-providers/generic-oidc](https://www.ory.com/docs/polis/sso-providers/generic-oidc)

## Which one to use

| Use case | Product | Configure as |
| --- | --- | --- |
| "Sign in with X" for end users | Kratos | Social sign-in provider |
| "B2B SSO — let an enterprise customer's IdP authenticate their users" | Polis | OIDC Relying Party per organization |
| Vendor without a dedicated guide that speaks OIDC | Either | Whichever fits the use case |

## What you'll need from the IdP

| Field | Source |
| --- | --- |
| Issuer URL | Discovered via `/.well-known/openid-configuration` automatically. |
| Client ID | Created when registering Ory as an OIDC client on the IdP side. |
| Client Secret | Same — store in secrets backend, never source. |
| Redirect URI | Ory's callback URL (different for Kratos vs Polis). |
| Scopes | At minimum `openid`, plus `profile` / `email` / `groups` as needed. |

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
