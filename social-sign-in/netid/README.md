# NetID

> **Maintained by:** Ory Engineering

Add NetID as a social sign-in provider in Ory Network. NetID is the European single sign-in alliance backed by Mediahuis, RTL, and ProSiebenSat.1 — common for German and EU consumer media products that want a privacy-respecting, GDPR-aligned sign-in option.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/kratos/social-signin/netid](https://www.ory.com/docs/kratos/social-signin/netid)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/netid). Short version:

1. In the [NetID Developer Zone](https://developerzone.netid.dev/), create a NetID Service and a NetID Client.
2. Set the Callback URL on the NetID Client to the redirect URI from the Ory Console.
3. While the Service is in sandbox mode, add test users on the NetID Service page so you can sign in.
4. Copy the Client ID and Client Secret (sandbox or live) into the Ory Console's NetID form.
5. Add `openid` and `email` scopes and the Jsonnet data-mapping snippet from the docs page (default returns the email only when `email_verified` is true).

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
