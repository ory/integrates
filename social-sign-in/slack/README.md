# Slack

> **Maintained by:** Ory Engineering

Add Sign in with Slack as a social sign-in provider in Ory Network. The Slack provider uses Slack's OAuth 2.0 "Sign in with Slack" flow, which returns the user's identity plus the ID of their Slack workspace (team), which makes it a natural sign-in option for B2B products where workspace membership signals access.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/slack](https://www.ory.com/docs/integrates-with/social-sign-in/slack) — full guide: [ory.com/docs/kratos/social-signin/slack](https://www.ory.com/docs/kratos/social-signin/slack)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/slack). Short version:

1. In the [Slack API → Your Apps](https://api.slack.com/apps), create a new app. Under **OAuth & Permissions**, add the redirect URI from the Ory Console.
2. Under **User Token Scopes**, add the `identity.basic` and `identity.email` scopes. Ory requests the scopes in the provider's `scope` list and rejects the sign-in if Slack doesn't grant all of them.
3. Install the app to your workspace. Copy the Client ID and Client Secret into the Ory Console's Slack form.
4. Add the Jsonnet data-mapping snippet from the docs page. The claims include `sub`, `name`, `email`, `picture`, and the workspace ID as `team`.
5. Save and trigger a registration flow to test.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
