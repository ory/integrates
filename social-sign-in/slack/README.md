# Slack

> **Maintained by:** Ory Engineering

Add Sign in with Slack as a social sign-in provider in Ory Network. Slack's "Sign in with Slack" OIDC flow returns the user's identity plus their Slack workspace (team) membership, which makes it a natural sign-in option for B2B products where workspace membership signals access.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/slack](https://www.ory.com/docs/integrates-with/social-sign-in/slack) — full guide: [ory.com/docs/kratos/social-signin/slack](https://www.ory.com/docs/kratos/social-signin/slack)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/slack). Short version:

1. In the [Slack API → Your Apps](https://api.slack.com/apps), create a new app. Under **OAuth & Permissions**, add the redirect URI from the Ory Console.
2. Enable **Sign in with Slack** under **User Token Scopes** and add `openid`, `email`, `profile` scopes.
3. Install the app to your workspace. Copy the Client ID and Client Secret into the Ory Console's Slack form.
4. Add the Jsonnet data-mapping snippet from the docs page (default maps `email`, `name`, and Slack-specific `https://slack.com/team_id`).
5. Save and trigger a registration flow to test.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
