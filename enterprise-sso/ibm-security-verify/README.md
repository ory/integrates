# IBM Security Verify — Ory Network Integration

> **Maintained by:** Ory Engineering

## Overview

IBM Security Verify is IBM's cloud-delivered identity and access management platform. It exposes standard OIDC and SAML 2.0 endpoints for federation, and can be configured as an upstream identity provider in Ory Network so that IBM-managed enterprise identities can sign in to Ory-protected applications.

## Prerequisites

1. **Ory Network account.**
2. **IBM Security Verify tenant** (URL of the form `https://<tenant>.verify.ibm.com`).
3. **Administrator access** to register an application and grant entitlements.

## OIDC configuration

In the IBM Security Verify admin console:
1. Go to **Applications → Add application → Custom application**.
2. Choose **OIDC** as the sign-on method.
3. Set the redirect URI:
   ```
   https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/ibm-security-verify
   ```
4. Enable **Authorization Code** grant type.
5. Note the **Client ID** and **Client Secret**.
6. Grant the application the entitlement to your user community.

In Ory:

```bash
ory patch identity-config \
  --project <your-project-id> \
  --workspace <your-workspace-id> \
  --add '/selfservice/methods/oidc/config/providers/-={
    "id": "ibm-security-verify",
    "provider": "generic",
    "issuer_url": "https://<tenant>.verify.ibm.com/oidc/endpoint/default",
    "client_id": "<isv-client-id>",
    "client_secret": "<isv-client-secret>",
    "scope": ["openid", "profile", "email"],
    "mapper_url": "base64://'"$(base64 < isv-mapper.jsonnet)"'"
  }'
```

Sample mapper (`isv-mapper.jsonnet`):

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

If your enterprise standard is SAML, register Ory as a SAML relying party in IBM Security Verify, then federate it through Ory Polis. Export the IBM IdP metadata XML, upload it under **Authentication → Enterprise SSO → SAML providers** in the Ory Console, and configure the ACS URL Ory provides back in IBM.

## Technical details

| Field | Value |
|---|---|
| OIDC discovery | `https://<tenant>.verify.ibm.com/oidc/endpoint/default/.well-known/openid-configuration` |
| Authorization URL | `https://<tenant>.verify.ibm.com/oidc/endpoint/default/authorize` |
| Token URL | `https://<tenant>.verify.ibm.com/oidc/endpoint/default/token` |
| Userinfo URL | `https://<tenant>.verify.ibm.com/oidc/endpoint/default/userinfo` |
| Common scopes | `openid`, `profile`, `email` |

## Resources

- [IBM Security Verify — OIDC integration](https://www.ibm.com/docs/en/security-verify?topic=oidc-integrating-applications-using-protocol)
- [IBM Security Verify — SAML integration](https://www.ibm.com/docs/en/security-verify?topic=saml-integrating-applications-using-2)
- [Ory generic OIDC provider docs](https://www.ory.com/docs/kratos/social-signin/generic)
