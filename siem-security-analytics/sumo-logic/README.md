# Sumo Logic

> **Maintained by:** Community contributors

[Sumo Logic](https://www.sumologic.com/) is a cloud-native machine-data analytics platform — log management, Cloud SIEM, observability. Ingest Ory identity events into Sumo Logic via an **HTTP Source** on a Hosted Collector — the simplest ingest path of any SIEM.

**Type:** webhook (Ory Action POSTs directly to Sumo HTTP Source — no handler needed)
**Docs page:** [ory.com/docs/integrates-with/siem-security-analytics/sumo-logic](https://www.ory.com/docs/integrates-with/siem-security-analytics/sumo-logic)

## How it works

1. In Sumo Logic, create a **Hosted Collector** → **HTTP Source** — Sumo returns a unique ingest URL.
2. Configure an Ory Action on each lifecycle hook (async, `response.ignore: true`) pointing **directly at the Sumo HTTP Source URL** with a Jsonnet body emitting the event payload as JSON.
3. Sumo automatically parses the JSON, applies the Source Category configured on the HTTP Source, and the events become queryable immediately. Ory Network ignores the webhook `headers` setting, so set the Source Category on the HTTP Source itself rather than with an `X-Sumo-Category` header.

No webhook handler required — Sumo's HTTP Source accepts unauthenticated POSTs to the unique tokenized URL.

## Setup outline

1. **Manage Data** → **Collection** → **Add Collector** → **Hosted Collector** (one-time setup).
2. Add an **HTTP Logs & Metrics Source** → set Source Category (e.g. `ory/identity-events`); copy the **HTTP Source URL** (token-bearing).
3. Configure Ory Actions on each event (registration, login, settings, recovery, verification). Put each action in the method-specific lists, such as `selfservice.flows.registration.after.password.hooks` and `selfservice.flows.login.after.password.hooks`, and repeat it for every method you enable, such as `oidc` or `code`. Ory Kratos Identities runs the flow-level `after.hooks` lists only for a method that has no hooks of its own, and on Ory Network the registration `password` list always contains `session`; keep `session` last. Recovery and verification have only flow-level lists, such as `selfservice.flows.verification.after.hooks`. See [Attach `after` actions to authentication methods](https://www.ory.com/docs/kratos/hooks/configure-hooks#attach-after-actions-to-authentication-methods).
   - URL: the HTTP Source URL.
   - Method: POST.
   - Body: Jsonnet emitting the relevant event fields as JSON. Read optional traits and headers with `std.get`, because Jsonnet fails on a missing field and Ory then drops the request. Take the client IP from the `True-Client-Ip` request header.
   - `response.ignore: true`.
4. In Sumo Logic search, query `_sourceCategory=ory/identity-events` to see ingested events.

## Notable

- The HTTP Source URL is the auth — treat it as a secret; rotate via Sumo if it leaks.
- For Cloud SIEM, parse the events into Sumo's normalized schema using a Field Extraction Rule (FER) or a parsing job; this enables out-of-the-box rules for credential-stuffing / brute-force / impossible-travel detection.
- For high-volume products, set retention + partition rules in Sumo to manage cost.

## Status

Community / proposed — no dedicated Ory documentation.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
