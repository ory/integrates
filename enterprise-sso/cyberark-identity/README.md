# CyberArk Identity — Ory Network Integration

> **Maintained by:** Ory Engineering

## Overview

CyberArk Identity is the SSO and identity portion of the CyberArk platform — distinct from CyberArk's PAM (Privileged Access Management) product. It exposes standard SAML 2.0 and OIDC endpoints for federation, and can be configured as an upstream identity provider in Ory Network to bring CyberArk-managed enterprise identities into Ory-protected applications.

> **Scope note.** This integration covers **CyberArk Identity SSO** only. PAM-specific REST integration (vaulting, session management, privileged-credential workflows) is out of scope here. If you have a customer use case for PAM integration, open an issue and we can scope a webhook integration.

## Prerequisites

1. **Ory Network account.**
2. **CyberArk Identity tenant** (URL of the form `https://<tenant>.id.cyberark.cloud` or the legacy `https://<tenant>.idaptive.app`).
3. **Administrator access** to register a web application in CyberArk Identity.

## OIDC configuration

In the CyberArk Identity admin portal:
1. Go to **Apps & Widgets → Web Apps → Add Web App → Custom**.
2. Choose **OpenID Connect**.
3. Set:
   - Application ID: `ory-network`
   - Redirect URI:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/cyberark-identity
     ```
   - Scopes: `openid`, `profile`, `email`
4. Note the **Client ID** and **Client Secret**.
5. Assign the application to the CyberArk roles or users that should be able to sign in.

In Ory:

```bash
ory patch identity-config \
  --project <your-project-id> \
  --workspace <your-workspace-id> \
  --add '/selfservice/methods/oidc/config/providers/-={
    "id": "cyberark-identity",
    "provider": "generic",
    "issuer_url": "https://<tenant>.id.cyberark.cloud",
    "client_id": "<cyberark-client-id>",
    "client_secret": "<cyberark-client-secret>",
    "scope": ["openid", "profile", "email"],
    "mapper_url": "base64://'"$(base64 < cyberark-mapper.jsonnet)"'"
  }'
```

Sample mapper (`cyberark-mapper.jsonnet`):

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

If your standard is SAML, register the application as a **SAML web app** in CyberArk Identity. Export the IdP metadata XML and upload it under **Authentication → Enterprise SSO → SAML providers** in the Ory Console.

## Technical details

| Field | Value |
|---|---|
| OIDC discovery | `https://<tenant>.id.cyberark.cloud/.well-known/openid-configuration` |
| Common scopes | `openid`, `profile`, `email` |

## Resources

- [CyberArk Identity OIDC docs](https://docs.cyberark.com/identity/Latest/en/Content/Applications/AppsCustom/AddOpenIDConnect.htm)
- [CyberArk Identity SAML docs](https://docs.cyberark.com/identity/Latest/en/Content/Applications/AppsWeb/U2-AddSAMLApp.htm)
- [Ory generic OIDC provider docs](https://www.ory.com/docs/kratos/social-signin/generic)
- [Ory Polis SAML federation](https://www.ory.com/docs/identities/sign-in/saml)
