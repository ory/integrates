# Mixpanel

> **Maintained by:** Community contributors

[Mixpanel](https://mixpanel.com) is a product-analytics platform. This integration sends Ory authentication events (registration / login / verification / MFA) into Mixpanel via the Ingestion API so product analysts see identity events in funnels and retention dashboards.

**Type:** webhook (Ory Action POSTs directly to Mixpanel Ingestion API — no handler needed)
**Docs page:** [ory.com/docs/integrates-with/cdp-analytics/mixpanel](https://www.ory.com/docs/integrates-with/cdp-analytics/mixpanel)

## How it works

Configure an Ory Action on each lifecycle hook (async, `response.ignore: true`) with a Jsonnet body that emits a Mixpanel event payload, POSTed directly to `https://api.mixpanel.com/track` (or `https://api-eu.mixpanel.com/track` for EU residency). The Project Token in the event payload authenticates the request.

Attach each action to the method-specific lists, such as `selfservice.flows.registration.after.password.hooks` and `selfservice.flows.login.after.password.hooks`, and repeat it for every method you enable, such as `oidc` or `code`. On Ory Network, the registration `password` list contains `session`; keep it last. Verification has only the flow-level `selfservice.flows.verification.after.hooks` list. See [Attach `after` actions to authentication methods](https://www.ory.com/docs/kratos/hooks/configure-hooks#attach-after-actions-to-authentication-methods).

## Setup outline

1. In Mixpanel → **Project Settings** → copy the **Project Token**.
2. Configure Ory Actions for each event:
   - URL: `https://api.mixpanel.com/track?ip=0`.
   - Method: POST. Ory sends the body as `application/json`.
   - Body Jsonnet: `[{ "event": "ory_login", "properties": { "token": "<PROJECT_TOKEN>", "distinct_id": ctx.identity.id, "$insert_id": ctx.flow.id, ... } }]`.
   - `response.ignore: true`.
3. For user-property updates (identity trait changes), use Mixpanel's `/engage` endpoint with `$set` operations.

## Notable

- **Stable `distinct_id`** — use Ory's identity id, not email. Mixpanel identity merging breaks if `distinct_id` changes.
- **`$insert_id`** for deduplication — set to Ory's flow id so retries don't double-count events.
- Mixpanel's IP geolocation defaults to enabled (`ip=1`); pass `?ip=0` to disable when the IP belongs to your server, not the user.
- `/track` accepts only the Project Token. Service Account authentication (HTTP Basic) works with the `/import` endpoint, not with `/track`.

## Status

Community / proposed — no dedicated Ory documentation.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
