# Generic SAML 2.0

> **Maintained by:** Ory Engineering

Configure any SAML 2.0-compliant Identity Provider with Ory. SAML support in Ory is provided by **Ory Polis** (formerly SAML Jackson) acting as the SAML Service Provider — Kratos itself does not natively speak SAML.

> Same source page as [`enterprise-sso/generic-saml`](../../enterprise-sso/generic-saml/) — categorization choice.

**Type:** config (no webhook code)
**Docs page:** [ory.com/docs/integrates-with/generic-protocols/generic-saml](https://www.ory.com/docs/integrates-with/generic-protocols/generic-saml) — full guide: [ory.com/docs/polis/sso-providers/generic-saml](https://www.ory.com/docs/polis/sso-providers/generic-saml)

## When to use

- Your IdP is **not listed** in [`polis/sso-providers/`](https://www.ory.com/docs/polis/sso-providers/) but speaks SAML 2.0.
- Your IdP **is listed** but you want the underlying mechanics for debugging or non-default configuration.
- You're integrating a less-common IdP (CyberArk, ForgeRock, IBM Security Verify, in-house Shibboleth, SimpleSAMLphp, custom SAML).

## What you'll need from the IdP

| Field | Source |
| --- | --- |
| IdP Metadata XML | Most IdPs publish this at a metadata URL or as a downloadable XML file. Polis can consume either. |
| Or: IdP Entity ID, SSO URL, signing certificate | If no metadata XML available, paste manually. |
| Attribute mapping | Define what the IdP sends as `email`, `firstName`, `lastName`, `groups`, etc. |

## What you'll give the IdP

| Field | Source |
| --- | --- |
| Polis SP Metadata XML | From your Ory Network organization's setup-link. The IdP uses this to know where to send the SAML assertion. |
| Or: ACS URL, Entity ID, signing certificate | Same data, manual paste. |

Polis is **SP-initiated only** — it does not consume IdP-initiated SAML responses.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
