# Mailchimp (Marketing)

> **Maintained by:** Community contributors

Sync newly registered Ory Network users into a Mailchimp **audience** (subscriber list) via Ory Actions, so marketing campaigns reach the right people automatically.

> This is the **marketing** Mailchimp integration. For sending transactional emails (verification, password reset, OTP) via Mandrill, see [`email-providers/mailchimp-transactional`](../../email-providers/mailchimp-transactional/).

**Type:** webhook (Ory Actions on registration)
**Docs page:** [ory.com/docs/actions/integrations/mailchimp](https://www.ory.com/docs/actions/integrations/mailchimp)

## How it works

1. User completes the registration self-service flow.
2. Ory triggers an `after` action registered on `flows.registration.after.hooks`.
3. The action evaluates a Jsonnet template that maps Ory identity traits to Mailchimp merge fields and tags.
4. Ory POSTs to the Mailchimp Marketing API to add or update the subscriber in the configured audience.

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/actions/integrations/mailchimp). Short version:

1. Create a Mailchimp **Marketing API key** (distinct from the Mandrill key used for transactional email).
2. Identify the target audience (list) ID from the Mailchimp dashboard.
3. Create an Ory Action of type `web_hook` on `flows.registration.after.hooks` pointing at `https://{dc}.api.mailchimp.com/3.0/lists/{list_id}/members`, with HTTP basic auth (`anystring:{api_key}`) and a Jsonnet body template that maps `identity.traits.email` and `identity.traits.name` into Mailchimp merge fields.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
