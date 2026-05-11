# Sign in with UAEPass — Ory Network Integration

> **Maintained by:** Ory Engineering

## Overview

UAEPass is the United Arab Emirates' national digital identity. It is required to access most UAE government services and many licensed private-sector services in the country. UAEPass exposes a standard OAuth 2.0 / OIDC interface and can be configured as a federated identity provider in Ory Kratos for any application that targets UAE users or needs regional compliance.

## How it works

```
User → Ory Login UI → Ory Kratos (OIDC, "uaepass" provider)
                          ↓
                    UAEPass Authorization
                    (https://id.uaepass.ae/idshub/authorize)
                          ↓
                    User authenticates with UAE national ID, biometrics, or PIN
                          ↓
                    UAEPass Token Endpoint
                    (https://id.uaepass.ae/idshub/token)
                          ↓
                    UAEPass Userinfo
                    (https://id.uaepass.ae/idshub/userinfo)
                          ↓
                    Ory Kratos creates / updates identity
```

## Prerequisites

1. **Ory Network account.**
2. **UAEPass partner / service-provider account.** UAEPass onboarding is gated — you apply at [docs.uaepass.ae](https://docs.uaepass.ae/) and are issued staging and production credentials after legal review. There is no self-service signup.
3. **Approved redirect URI** — provided to UAEPass during onboarding:
   ```
   https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/uaepass
   ```

## Configuration

Save a Jsonnet claims mapper as `uaepass-mapper.jsonnet`:

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'firstnameEN' in claims then 'first' else null]: claims.firstnameEN,
        [if 'lastnameEN' in claims then 'last' else null]: claims.lastnameEN,
      },
      [if 'idn' in claims then 'national_id' else null]: claims.idn,
      [if 'mobile' in claims then 'phone' else null]: claims.mobile,
    },
  },
}
```

Add UAEPass via the Ory CLI:

```bash
ory patch identity-config \
  --project <your-project-id> \
  --workspace <your-workspace-id> \
  --add '/selfservice/methods/oidc/config/providers/-={
    "id": "uaepass",
    "provider": "generic",
    "issuer_url": "https://id.uaepass.ae/idshub",
    "auth_url": "https://id.uaepass.ae/idshub/authorize",
    "token_url": "https://id.uaepass.ae/idshub/token",
    "client_id": "<uaepass-client-id>",
    "client_secret": "<uaepass-client-secret>",
    "scope": ["openid", "profile", "urn:uae:digitalid:profile:general"],
    "mapper_url": "base64://'"$(base64 < uaepass-mapper.jsonnet)"'"
  }'
```

## Technical details

| Field | Value |
|---|---|
| Authorization URL | `https://id.uaepass.ae/idshub/authorize` |
| Token URL | `https://id.uaepass.ae/idshub/token` |
| Userinfo URL | `https://id.uaepass.ae/idshub/userinfo` |
| Issuer | `https://id.uaepass.ae/idshub` |
| Common scopes | `openid`, `profile`, `urn:uae:digitalid:profile:general` |

UAEPass operates separate **staging** (`https://stg-id.uaepass.ae/...`) and **production** environments — credentials and redirect URIs are not shared between them.

## Notes

- UAEPass returns Arabic and English variants of name fields (`firstnameAR` / `firstnameEN`). Pick the variant your app needs in the mapper.
- Some claims (Emirates ID `idn`, `mobile`, address) require explicit consent screens UAEPass renders — do not assume they will be present.
- UAEPass requires sign-out coordination through their `idshub/logout` endpoint when ending Ory sessions, if your contract requires it.

## Resources

- [UAEPass Developer Docs](https://docs.uaepass.ae/)
- [UAEPass OIDC integration guide](https://docs.uaepass.ae/feature-guides/authentication/web-application)
- [Ory generic OIDC provider docs](https://www.ory.com/docs/kratos/social-signin/generic)
