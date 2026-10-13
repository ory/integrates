# ID.me

> **Maintained by:** Community contributors

[ID.me](https://www.id.me) is a US-government-trusted identity-verification provider that delivers NIST 800-63 IAL2 / AAL2 assurance through standard OIDC. Configure as a federated OIDC provider in Ory Network to lean on ID.me's existing verified user base instead of running document checks yourself.

ID.me also offers **verified group claims** (Military, First Responder, Student, Teacher, Government Employee, Nurse, etc.) — useful for verified-discount and access-gating use cases.

**Type:** config (Ory CLI / generic OIDC provider — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/identity-verification/id-me](https://www.ory.com/docs/integrates-with/identity-verification/id-me)

## Setup

ID.me is OIDC-compliant; configure it as a `generic` provider with the issuer URL. Ory reads the endpoints from `https://api.id.me/oidc/.well-known/openid-configuration`:

| Setting | Value |
| --- | --- |
| Issuer URL | `https://api.id.me/oidc` |
| Authorization | `https://api.id.me/oauth/authorize` |
| Token | `https://api.id.me/oauth/token` |
| Userinfo | `https://api.id.me/api/public/v3/userinfo` |
| Redirect URI | `https://<project-slug>.projects.oryapis.com/self-service/methods/oidc/callback/id-me` |
| Required scopes | `openid` (identity); plus group scopes like `military`, `nurse`, `teacher` for verified claims |

## Steps

1. Sign up at [developers.id.me](https://developers.id.me) for a developer account.
2. Create an application and add the Ory redirect URI as an approved Redirect URI.
3. Submit the application for ID.me review — required before scopes like `military`, `nurse`, `teacher` are released to the application.
4. Configure ID.me as a generic OIDC provider in your identity configuration:

   ```yaml
   selfservice:
     methods:
       oidc:
         enabled: true
         config:
           providers:
             - id: id-me
               provider: generic
               label: ID.me
               client_id: <your-client-id>
               client_secret: <your-client-secret>
               issuer_url: https://api.id.me/oidc
               mapper_url: base64://<base64-encoded-jsonnet>
               scope:
                 - openid
   ```

   Add the group scopes that ID.me approved for your app to `scope`. The provider `id` must match the last path segment of the redirect URI.
5. Map the OIDC claims (and any verified-group claims) to identity traits / metadata via Jsonnet.

## Status

Community / proposed — no dedicated ory/docs page. Maintained by community contributions.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
