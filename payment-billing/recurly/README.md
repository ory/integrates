# Recurly

> **Maintained by:** Community contributors

[Recurly](https://recurly.com) is a subscription management and billing platform. This integration provides **bidirectional sync**: Ory → Recurly to create accounts at signup; Recurly → Ory to surface subscription state (active / churned / past due) on the identity so application code can gate features by subscription tier without a separate Recurly lookup.

**Type:** webhook (two Ory Actions + a Recurly webhook handler — wiring is Ory Action config + customer-implemented handler)
**Docs page:** [ory.com/docs/integrates-with/payment-billing/recurly](https://www.ory.com/docs/integrates-with/payment-billing/recurly)

## How it works

**Outbound: Ory → Recurly**
1. Ory Action on `registration.after` (async) calls handler.
2. Handler verifies the Ory webhook secret.
3. Handler calls Recurly's API to create an Account record keyed by the Ory identity id.
4. Handler PATCHes `metadata_public.recurly = { account_code, subscription_state: "none" }` on the Ory identity.

**Inbound: Recurly → Ory**
1. Recurly fires a webhook on subscription events (created, canceled, expired, paused, past_due).
2. Handler verifies Recurly's signature (HMAC-SHA256 over the raw body using the configured webhook secret).
3. Handler PATCHes `metadata_public.recurly.subscription_state` and `subscription_tier` on the matching Ory identity (resolved via the `account_code`).

## Setup outline

1. In Recurly → **Integrations** → **Webhooks**, configure a webhook target pointing at your handler with a signing secret.
2. Build a webhook handler with both endpoints — sync inbound from Ory + async from Recurly.
3. Configure an Ory Action on `registration.after` (async) pointing at the handler.

## Notable

- Use Recurly's `account_code` as the binding between Recurly accounts and Ory identities — set it to the Ory identity id during account creation for stable lookup.
- Subscription gating belongs in **application code** reading `metadata_public.recurly.subscription_state`, not in the auth flow — Ory shouldn't block sign-in for a churned subscriber; the app should redirect them to the billing page.
- Recurly webhooks are at-least-once; the handler must be idempotent (PATCH is naturally idempotent).

## Status

Community / proposed — no dedicated Ory documentation, no first-party handler.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
