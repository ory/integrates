# Generic OIDC Provider

> **Maintained by:** Ory Engineering

Configure **any** OIDC-compliant Identity Provider into Ory Polis as the OIDC Relying Party. This is the canonical reference for setting up OIDC-based enterprise SSO with Ory and the fallback when no provider-specific guide covers your IdP.

> Mirrored under [`generic-protocols/generic-oidc`](../../generic-protocols/generic-oidc/) — same source page on ory.com/docs.

**Type:** config (Polis OIDC connection — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/generic-oidc](https://www.ory.com/docs/integrates-with/enterprise-sso/generic-oidc) — full guide: [ory.com/docs/polis/sso-providers/generic-oidc](https://www.ory.com/docs/polis/sso-providers/generic-oidc)

## When to use

- Your IdP is **not listed** in [`polis/sso-providers/`](https://www.ory.com/docs/polis/sso-providers/) but speaks OIDC.
- Your IdP **is listed** but you want the underlying mechanics for debugging or non-default configuration.
- You're integrating an open-source IdP (Keycloak, Authentik, Zitadel, etc.) that doesn't have a vendor-specific guide.

## What you'll need from the IdP

| Field | Source |
| --- | --- |
| Issuer URL | Usually `https://<idp-host>/.well-known/openid-configuration` minus the path — Polis fetches discovery automatically. |
| Client ID | Created in the IdP when registering Polis as an OIDC client. |
| Client Secret | Same — store in your secrets backend, never in source. |
| Redirect URI | Polis ACS URL from your Ory Network organization's setup-link. |
| Scopes | At minimum `openid` and `profile`; `email` for identity, `groups` if you map them. |

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
