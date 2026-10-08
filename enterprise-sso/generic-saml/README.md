# Generic SAML 2.0

> **Maintained by:** Ory Engineering

Configure **any** SAML 2.0-compliant Identity Provider for enterprise single sign-on (SSO). Ory Network acts as the SAML service provider (SP) for organizations. When you self-host Ory Polis, Ory Polis is the SAML SP. This is the canonical reference for setting up SAML-based enterprise SSO with Ory and the fallback when no provider-specific guide covers your IdP.

> Mirrored under [`generic-protocols/generic-saml`](../../generic-protocols/generic-saml/) — same source page on ory.com/docs.

**Type:** config (SAML connection on an Ory Network organization, or self-hosted Ory Polis — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/enterprise-sso/generic-saml](https://www.ory.com/docs/integrates-with/enterprise-sso/generic-saml) — full guide: [ory.com/docs/polis/sso-providers/generic-saml](https://www.ory.com/docs/polis/sso-providers/generic-saml)

## Ory Network connection values

On Ory Network, add the IdP as a SAML connection to an [organization](https://www.ory.com/docs/kratos/organizations) in your project. In the IdP's SAML application, enter these values:

- **ACS URL:** `https://<your-project-slug>.projects.oryapis.com/saml/api/oauth/saml`
- **SP entity ID:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/saml/organizations/<your-organization-id>`

The Ory Console shows these values when you add the connection. When you self-host Ory Polis, use the URLs of your own Ory Polis deployment instead.

## When to use

- Your IdP is **not listed** in [`polis/sso-providers/`](https://www.ory.com/docs/polis/sso-providers/) but speaks SAML 2.0.
- Your IdP **is listed** but you want the underlying mechanics for debugging or non-default configuration.
- You're integrating a less-common IdP (CyberArk, ForgeRock, IBM Verify, OneLogin Directory, custom in-house SAML).

## What you'll need from the IdP

| Field | Source |
| --- | --- |
| IdP Metadata XML | Most IdPs publish this at a metadata URL or as a downloadable XML file. Ory can consume either. |
| Or: IdP Entity ID, SSO URL, signing certificate | If no metadata XML is available, paste these manually. |
| Attribute mapping | Define what the IdP sends as `email`, `firstName`, `lastName`, `groups`, etc. The connection's data mapping maps these to Ory traits. |

## What you'll give the IdP

| Field | Source |
| --- | --- |
| SP values | The ACS URL and SP entity ID from [Ory Network connection values](#ory-network-connection-values), or your self-hosted Ory Polis SP metadata. The IdP will use this to know where to send the SAML assertion. |
| Or: ACS URL, Entity ID, signing certificate | Same data, manual paste. |

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
