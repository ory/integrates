# Mailchimp (Marketing)

> **Maintained by:** Community contributors

Sync newly registered Ory Network users into a Mailchimp **audience** (subscriber list) via Ory Actions, so marketing campaigns reach the right people automatically.

> This is the **marketing** Mailchimp integration. For sending transactional emails (verification, password reset, OTP) via Mandrill, see [`email-providers/mailchimp-transactional`](../../email-providers/mailchimp-transactional/).

**Type:** webhook (Ory Actions on registration)
**Docs page:** [ory.com/docs/integrates-with/cdp-analytics/mailchimp](https://www.ory.com/docs/integrates-with/cdp-analytics/mailchimp) — full guide: [ory.com/docs/actions/integrations/mailchimp](https://www.ory.com/docs/actions/integrations/mailchimp)

## How it works

1. User completes the registration self-service flow.
2. Ory triggers the `after` action from the list of the sign-up method the user chose, for example `selfservice.flows.registration.after.password.hooks`.
3. The action evaluates a Jsonnet template that maps Ory identity traits to Mailchimp merge fields and tags.
4. Ory POSTs to the Mailchimp Marketing API to add the subscriber to the configured audience. The webhook URL is static, so this action can only add new members. To update an existing member when the user changes their profile, point a settings action at your own handler, which finds the member and updates it.

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/actions/integrations/mailchimp). Short version:

1. Create a Mailchimp **Marketing API key** (distinct from the Mandrill key used for transactional email).
2. Identify the target audience (list) ID from the Mailchimp dashboard.
3. Create an Ory Action of type `web_hook` with `response.ignore: true` pointing at `https://{dc}.api.mailchimp.com/3.0/lists/{list_id}/members`, with `basic_auth` (`anystring:{api_key}`) and a Jsonnet body template that maps `identity.traits.email` and the name traits into Mailchimp merge fields. Read optional traits with `std.get`, because Jsonnet fails on a missing field and Ory then drops the request. Attach the action to `selfservice.flows.registration.after.<method>.hooks` for each sign-up method you enable, such as `password` and `oidc`, not to the flow-level `after.hooks` list. On Ory Network, the `password` list contains `session`; keep it last. See [Attach `after` actions to authentication methods](https://www.ory.com/docs/kratos/hooks/configure-hooks#attach-after-actions-to-authentication-methods).

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
