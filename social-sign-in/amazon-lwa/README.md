# Login with Amazon

> **Maintained by:** Ory Engineering

Add Amazon (Login with Amazon, LWA) as a social sign-in provider in Ory Network. Useful for consumer products targeting the Amazon ecosystem (Alexa skills, FireOS apps, retail-adjacent flows) where users are already signed in to Amazon.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/amazon-lwa](https://www.ory.com/docs/integrates-with/social-sign-in/amazon-lwa) — full guide: [ory.com/docs/kratos/social-signin/amazon](https://www.ory.com/docs/kratos/social-signin/amazon)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/amazon). Short version:

1. In the [Amazon Developer Console](https://developer.amazon.com/), create a **Security Profile** (Login with Amazon → Create a New Security Profile). Note the Client ID and Client Secret.
2. In the Ory Console, enable **OpenID Connect** under Social Sign-In, click **Add new OpenID Connect provider**, choose Amazon, and copy the Redirect URI.
3. Paste the Client ID and Client Secret into the Ory Console form.
4. In the Amazon Security Profile → Web Settings, paste the Redirect URI into **Allowed Return URLs**.
5. Add the `profile` scope and the Jsonnet data-mapping snippet from the docs page (default maps `email`).

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
