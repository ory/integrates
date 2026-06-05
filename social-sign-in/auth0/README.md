# Auth0

> **Maintained by:** Ory Engineering

Add an Auth0 tenant as an upstream OIDC provider in Ory Network. Useful for migrations from Auth0 to Ory (run them side-by-side, federate Auth0 users into Ory until the cutover) or for products that already issue identities through Auth0 and want to layer Ory's flows on top.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/auth0](https://www.ory.com/docs/integrates-with/social-sign-in/auth0) — full guide: [ory.com/docs/kratos/social-signin/auth0](https://www.ory.com/docs/kratos/social-signin/auth0)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/auth0). Short version:

1. In your Auth0 tenant, [create a Regular Web Application](https://auth0.com/docs/applications) and paste the Ory redirect URI into **Allowed Callback URLs**.
2. Copy the Client ID and Client Secret from the application **Settings** tab into the Ory Console's Auth0 form.
3. Set the **Tenant URL** to your Auth0 top-level domain (typically `https://<tenant>.auth0.com`) — required so Ory validates the issuer.
4. Add the `openid`, `profile`, `email` scopes and the Jsonnet data-mapping snippet from the docs page (default returns email gated on `email_verified`; optionally maps `nickname` → `username`).
5. Save and trigger a registration flow to test.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
