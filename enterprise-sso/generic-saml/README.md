# Generic SAML 2.0

> **Maintained by:** Ory Engineering

Configure **any** SAML 2.0-compliant Identity Provider into Ory Polis as the SAML Service Provider. This is the canonical reference for setting up SAML-based enterprise SSO with Ory and the fallback when no provider-specific guide covers your IdP.

> Mirrored under [`generic-protocols/generic-saml`](../../generic-protocols/generic-saml/) — same source page on ory.com/docs.

**Type:** config (Polis SAML connection — no webhook code)
**Docs page:** [ory.com/docs/polis/sso-providers/generic-saml](https://www.ory.com/docs/polis/sso-providers/generic-saml)

## When to use

- Your IdP is **not listed** in [`polis/sso-providers/`](https://www.ory.com/docs/polis/sso-providers/) but speaks SAML 2.0.
- Your IdP **is listed** but you want the underlying mechanics for debugging or non-default configuration.
- You're integrating a less-common IdP (CyberArk, ForgeRock, IBM Security Verify, OneLogin Directory, custom in-house SAML).

## What you'll need from the IdP

| Field | Source |
| --- | --- |
| IdP Metadata XML | Most IdPs publish this at a metadata URL or as a downloadable XML file. Polis can consume either. |
| Or: IdP Entity ID, SSO URL, signing certificate | If no metadata XML is available, paste these manually. |
| Attribute mapping | Define what the IdP sends as `email`, `firstName`, `lastName`, `groups`, etc. Polis maps these to Ory traits. |

## What you'll give the IdP

| Field | Source |
| --- | --- |
| Polis SP Metadata XML | From your Ory Network organization's setup-link. The IdP will use this to know where to send the SAML assertion. |
| Or: ACS URL, Entity ID, signing certificate | Same data, manual paste. |

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
