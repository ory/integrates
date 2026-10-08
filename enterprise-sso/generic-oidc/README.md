# Generic OIDC Provider

> **Maintained by:** Ory Engineering

Configure **any** OIDC-compliant Identity Provider for enterprise single sign-on (SSO). On Ory Network, Ory Kratos is the OIDC relying party for an organization's connection. When you self-host Ory Polis, Ory Polis is the OIDC relying party. This is the canonical reference for setting up OIDC-based enterprise SSO with Ory and the fallback when no provider-specific guide covers your IdP.

> Mirrored under [`generic-protocols/generic-oidc`](../../generic-protocols/generic-oidc/) — same source page on ory.com/docs.

**Type:** config (OIDC connection on an Ory Network organization, or self-hosted Ory Polis — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/generic-oidc](https://www.ory.com/docs/integrates-with/enterprise-sso/generic-oidc) — full guide: [ory.com/docs/polis/sso-providers/generic-oidc](https://www.ory.com/docs/polis/sso-providers/generic-oidc)

## Ory Network connection values

On Ory Network, add the IdP as an OIDC connection to an [organization](https://www.ory.com/docs/kratos/organizations) in your project, using the IdP's issuer URL, client ID, and client secret. In the IdP's client settings, set this value:

- **OIDC redirect URI:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/oidc/organization/<your-organization-id>/callback/<your-connection-id>`

With `pkce: force`, the OIDC redirect URI is `https://<your-project-slug>.projects.oryapis.com/self-service/methods/oidc/callback` instead. Register the URI for your connection's PKCE setting, using the project's custom domain if configured.

The Ory Console shows these values when you add the connection. When you self-host Ory Polis, use the URLs of your own Ory Polis deployment instead.

## When to use

- Your IdP is **not listed** in [`polis/sso-providers/`](https://www.ory.com/docs/polis/sso-providers/) but speaks OIDC.
- Your IdP **is listed** but you want the underlying mechanics for debugging or non-default configuration.
- You're integrating an open-source IdP (Keycloak, Authentik, Zitadel, etc.) that doesn't have a vendor-specific guide.

## What you'll need from the IdP

| Field | Source |
| --- | --- |
| Issuer URL | Usually `https://<idp-host>/.well-known/openid-configuration` minus the path — Ory fetches discovery automatically. |
| Client ID | Created in the IdP when registering Ory as an OIDC client. |
| Client Secret | Same — store in your secrets backend, never in source. |
| Redirect URI | The OIDC redirect URI from [Ory Network connection values](#ory-network-connection-values). |
| Scopes | At minimum `openid` and `profile`; `email` for identity, `groups` if you map them. |

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
