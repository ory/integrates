# X / Twitter

> **Maintained by:** Ory Engineering

Add Sign in with X (Twitter) as a social sign-in provider in Ory Network. Useful for consumer apps where Twitter/X is part of the audience graph — content discovery, social-adjacent products, creator tools.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/x-twitter](https://www.ory.com/docs/integrates-with/social-sign-in/x-twitter) — full guide: [ory.com/docs/kratos/social-signin/x-twitter](https://www.ory.com/docs/kratos/social-signin/x-twitter)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/x-twitter). Short version:

1. In the [Twitter Developer Dashboard](https://developer.twitter.com/en/portal/dashboard), create a free Twitter v2 project + app. The free tier supports social sign-in.
2. Under **User authentication settings**: set Type of App to **Confidential Client**, toggle **Request email from users** on if you need email, and add the redirect URI from the Ory Console.
3. Copy the API Key (Client ID) and API Key Secret (Client Secret) into the Ory Console's Twitter form.
4. Add the Jsonnet data-mapping snippet from the docs page.
5. Save and trigger a registration flow to test.

The Ory provider id is `twitter` (not `x` or `x-twitter`) — Ory shipped this provider before the rebrand and the id is sticky.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
