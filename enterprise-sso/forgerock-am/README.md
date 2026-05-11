# ForgeRock Access Management — Ory Network Integration

> **Maintained by:** Ory Engineering

## Overview

ForgeRock Access Management (now part of Ping Identity) is a widely deployed enterprise IAM platform. Customers running ForgeRock AM upstream can federate it into Ory Network as either an **OIDC** or **SAML 2.0** identity provider, allowing existing enterprise sessions to flow through to Ory-protected applications without rebuilding workforce identity in Ory.

## Pick a federation mode

| Mode | When to use |
|---|---|
| **OIDC federation** | New deployments; you control the ForgeRock AM `oauth2` realm; you want JSON token claims and JWKS-based key rotation |
| **SAML 2.0 federation** | Existing AM environments already issuing SAML to other relying parties; corporate policy mandates SAML |

The two modes are not mutually exclusive — Ory can accept both for the same project.

## Prerequisites

1. **Ory Network account.**
2. **ForgeRock AM 7.x or later** with administrative access.
3. **Discovery endpoint** for OIDC: `https://<your-am-host>/am/oauth2/.well-known/openid-configuration` (or under a specific realm: `/am/oauth2/realms/<realm>/...`).

## OIDC configuration

In ForgeRock AM, register an OAuth 2.0 client:
- Client ID: `ory-network`
- Client Secret: generate
- Redirect URI:
  ```
  https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/forgerock-am
  ```
- Grant types: `Authorization Code`
- Scopes: `openid profile email`

In Ory:

```bash
ory patch identity-config \
  --project <your-project-id> \
  --workspace <your-workspace-id> \
  --add '/selfservice/methods/oidc/config/providers/-={
    "id": "forgerock-am",
    "provider": "generic",
    "issuer_url": "https://<your-am-host>/am/oauth2",
    "client_id": "ory-network",
    "client_secret": "<secret>",
    "scope": ["openid", "profile", "email"],
    "mapper_url": "base64://'"$(base64 < forgerock-mapper.jsonnet)"'"
  }'
```

Sample mapper (`forgerock-mapper.jsonnet`):

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'given_name' in claims then 'first' else null]: claims.given_name,
        [if 'family_name' in claims then 'last' else null]: claims.family_name,
      },
    },
  },
}
```

## SAML 2.0 configuration

For SAML, federate ForgeRock AM as an upstream IdP via Ory Polis:
1. Export ForgeRock's IdP metadata XML from the AM console.
2. Upload it to the Ory Console under **Authentication → Enterprise SSO → SAML providers**.
3. Configure the assertion consumer service (ACS) URL Ory provides into ForgeRock AM as a relying party.
4. Map SAML attribute statements to your Ory identity schema.

## Technical details

| Field | Value |
|---|---|
| OIDC discovery (default) | `https://<host>/am/oauth2/.well-known/openid-configuration` |
| OIDC discovery (per-realm) | `https://<host>/am/oauth2/realms/<realm>/.well-known/openid-configuration` |
| SAML metadata | Exported from AM console per circle of trust |

## Notes

- ForgeRock AM realms each have their own OIDC discovery URL. Confirm which realm your enterprise users authenticate against before configuring the issuer.
- Ory does not call ForgeRock's REST APIs directly — federation is purely token-based. PAM-style API integration is out of scope for this entry.
- If you are migrating off ForgeRock AM, the same OIDC config can be used for the migration window; the upstream provider just changes.

## Resources

- [ForgeRock AM OAuth 2.0 / OIDC docs](https://docs.pingidentity.com/auth-server/latest/oauth2-guide/index.html)
- [ForgeRock AM SAML 2.0 docs](https://docs.pingidentity.com/auth-server/latest/saml2-guide/index.html)
- [Ory generic OIDC provider docs](https://www.ory.com/docs/kratos/social-signin/generic)
- [Ory Polis SAML federation](https://www.ory.com/docs/identities/sign-in/saml)
