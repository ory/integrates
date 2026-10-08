# Generic SAML 2.0

> **Maintained by:** Ory Engineering

Configure any SAML 2.0-compliant Identity Provider with Ory. On Ory Network, add the IdP as a SAML connection to an [organization](https://www.ory.com/docs/kratos/organizations), and Ory Network acts as the SAML Service Provider (SP), with no Ory Polis deployment of your own. SAML connections are available on select Ory Network Enterprise plans. When you self-host, **Ory Polis** (formerly SAML Jackson) acts as the SAML SP.

> Same source page as [`enterprise-sso/generic-saml`](../../enterprise-sso/generic-saml/) — categorization choice.

**Type:** config (no webhook code)
**Docs page:** [ory.com/docs/integrates-with/generic-protocols/generic-saml](https://www.ory.com/docs/integrates-with/generic-protocols/generic-saml) — full guide: [ory.com/docs/polis/sso-providers/generic-saml](https://www.ory.com/docs/polis/sso-providers/generic-saml)

## Ory Network connection values

On Ory Network, add the IdP as a SAML connection to an [organization](https://www.ory.com/docs/kratos/organizations) in your project. In the IdP's SAML application, enter these values:

- **ACS URL:** `https://<your-project-slug>.projects.oryapis.com/saml/api/oauth/saml`
- **SP entity ID:** `https://<your-project-slug>.projects.oryapis.com/self-service/methods/saml/organizations/<your-organization-id>`

The Ory Console shows these values when you add the connection. When you self-host Ory Polis, use the URLs of your own Ory Polis deployment instead.

## When to use

- Your IdP is **not listed** in [`polis/sso-providers/`](https://www.ory.com/docs/polis/sso-providers/) but speaks SAML 2.0.
- Your IdP **is listed** but you want the underlying mechanics for debugging or non-default configuration.
- You're integrating a less-common IdP (CyberArk, ForgeRock, IBM Verify, in-house Shibboleth, SimpleSAMLphp, custom SAML).

## What you'll need from the IdP

| Field | Source |
| --- | --- |
| IdP Metadata XML | Most IdPs publish this at a metadata URL or as a downloadable XML file. Ory can consume either. |
| Or: IdP Entity ID, SSO URL, signing certificate | If no metadata XML available, paste manually. |
| Attribute mapping | Define what the IdP sends as `email`, `firstName`, `lastName`, `groups`, etc. |

## What you'll give the IdP

| Field | Source |
| --- | --- |
| SP values | The ACS URL and SP entity ID from [Ory Network connection values](#ory-network-connection-values), or your self-hosted Ory Polis SP metadata. The IdP uses this to know where to send the SAML assertion. |
| Or: ACS URL, Entity ID, signing certificate | Same data, manual paste. |

SAML connections on Ory Network support IdP-initiated login. It's off by default. See [IdP-initiated login](https://www.ory.com/docs/kratos/organizations#idp-initiated-login).

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
