# ID.me — Ory Network Integration

> **Maintained by:** Ory Engineering

## Overview

ID.me is a US-government-trusted identity verification provider that delivers IAL2 / AAL2 assurance through standard OIDC. Configuring ID.me as a federated provider in Ory Network gives customers a low-touch path to verified identity for healthcare, government, retail, and other use cases that require proof of who the user actually is rather than just who they claim to be.

ID.me also offers verified group claims (Military, First Responder, Student, Teacher, Government Employee, Nurse, etc.), which are useful for verified-discount and access-gating use cases.

## How it works

```
User → Ory Login UI → Ory Kratos (OIDC, "id-me" provider)
                          ↓
                    ID.me Authorization
                    (https://api.id.me/oauth/authorize)
                          ↓
                    User completes ID.me verification
                    (document scan, selfie, NIST 800-63 IAL2)
                          ↓
                    ID.me Token Endpoint
                    (https://api.id.me/oauth/token)
                          ↓
                    ID.me Userinfo
                    (https://api.id.me/api/public/v3/userinfo)
                          ↓
                    Ory Kratos creates / updates verified identity
```

## Prerequisites

1. **Ory Network account.**
2. **ID.me developer account** at [developers.id.me](https://developers.id.me/).
3. **An approved ID.me application** with the policies / scopes you intend to use. ID.me requires application review before scopes like `military`, `nurse`, `teacher`, etc. are released.
4. **Approved redirect URI**:
   ```
   https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/id-me
   ```

## Configuration

Save a Jsonnet claims mapper as `id-me-mapper.jsonnet`:

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'fname' in claims then 'first' else null]: claims.fname,
        [if 'lname' in claims then 'last' else null]: claims.lname,
      },
      [if 'verified' in claims then 'idme_verified' else null]: claims.verified,
      [if 'groups' in claims then 'idme_groups' else null]: claims.groups,
    },
  },
}
```

Add ID.me via the Ory CLI:

```bash
ory patch identity-config \
  --project <your-project-id> \
  --workspace <your-workspace-id> \
  --add '/selfservice/methods/oidc/config/providers/-={
    "id": "id-me",
    "provider": "generic",
    "issuer_url": "https://api.id.me",
    "auth_url": "https://api.id.me/oauth/authorize",
    "token_url": "https://api.id.me/oauth/token",
    "client_id": "<id-me-client-id>",
    "client_secret": "<id-me-client-secret>",
    "scope": ["openid", "identity"],
    "mapper_url": "base64://'"$(base64 < id-me-mapper.jsonnet)"'"
  }'
```

## Technical details

| Field | Value |
|---|---|
| Authorization URL | `https://api.id.me/oauth/authorize` |
| Token URL | `https://api.id.me/oauth/token` |
| Userinfo URL | `https://api.id.me/api/public/v3/userinfo` |
| Identity-verification scope | `identity` (returns first/last name, DOB, address) |
| Group scopes | `military`, `responder`, `student`, `teacher`, `government`, `nurse`, … |

## Notes

- ID.me's userinfo claim names (`fname`, `lname`) are non-standard. The mapper above normalizes them.
- Group claims are returned as an array; verify the shape against the ID.me docs before relying on them in production.
- For high-assurance use cases, anchor downstream policies on `claims.verified === true`, not just on the OIDC sign-in success.

## Resources

- [ID.me Developer Portal](https://developers.id.me/)
- [ID.me OIDC reference](https://developers.id.me/documentation/federated-protocols/openid)
- [ID.me userinfo claims](https://developers.id.me/documentation/api-reference/end-points/userinfo)
- [Ory generic OIDC provider docs](https://www.ory.com/docs/kratos/social-signin/generic)
