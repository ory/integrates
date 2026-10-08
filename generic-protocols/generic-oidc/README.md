# Generic OIDC Provider

> **Maintained by:** Ory Engineering

Configure any OpenID Connect-compliant Identity Provider with Ory. OIDC shows up in two Ory product surfaces:

- **Ory Kratos social sign-in / federated sign-in** — for consumer or user-facing sign-in flows. Kratos is the OIDC Relying Party.
- **Enterprise SSO for organizations** — for B2B SSO with per-organization isolation. On Ory Network, add the IdP as an OIDC connection to an [organization](https://www.ory.com/docs/kratos/organizations); Ory Kratos is the OIDC Relying Party. When you self-host Ory Polis, Ory Polis is the OIDC Relying Party on behalf of an organization.

> Same source page as [`enterprise-sso/generic-oidc`](../../enterprise-sso/generic-oidc/) — categorization choice.

**Type:** config (no webhook code)
**Docs page:** [ory.com/docs/integrates-with/generic-protocols/generic-oidc](https://www.ory.com/docs/integrates-with/generic-protocols/generic-oidc)
- Kratos generic OIDC: [ory.com/docs/kratos/social-signin/generic](https://www.ory.com/docs/kratos/social-signin/generic)
- Polis generic OIDC: [ory.com/docs/polis/sso-providers/generic-oidc](https://www.ory.com/docs/polis/sso-providers/generic-oidc)

## Ory Network connection values

On Ory Network, add the IdP as an OIDC connection to an [organization](https://www.ory.com/docs/kratos/organizations) in your project, using the IdP's issuer URL, client ID, and client secret. In the IdP's client settings, set this value:

- **OIDC redirect URI:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/oidc/organization/<your-organization-id>/callback/<your-connection-id>`

With `pkce: force`, the OIDC redirect URI is `https://<your-project-slug>.projects.oryapis.com/self-service/methods/oidc/callback` instead. Register the URI for your connection's PKCE setting, using the project's custom domain if configured.

The Ory Console shows these values when you add the connection. When you self-host Ory Polis, use the URLs of your own Ory Polis deployment instead.

## Which one to use

| Use case | Product | Configure as |
| --- | --- | --- |
| "Sign in with X" for end users | Kratos | Social sign-in provider |
| "B2B SSO — let an enterprise customer's IdP authenticate their users" | Ory Network organizations (or self-hosted Polis) | OIDC connection per organization |
| Vendor without a dedicated guide that speaks OIDC | Either | Whichever fits the use case |

## What you'll need from the IdP

| Field | Source |
| --- | --- |
| Issuer URL | Discovered via `/.well-known/openid-configuration` automatically. |
| Client ID | Created when registering Ory as an OIDC client on the IdP side. |
| Client Secret | Same — store in secrets backend, never source. |
| Redirect URI | Ory's callback URL. Social sign-in uses `/self-service/methods/oidc/callback/<provider-id>`; organization connections use the URI in [Ory Network connection values](#ory-network-connection-values). |
| Scopes | At minimum `openid`, plus `profile` / `email` / `groups` as needed. |

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
