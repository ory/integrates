# Amplitude

> **Maintained by:** Community contributors

[Amplitude](https://amplitude.com) is a product-analytics platform. This integration sends Ory authentication events (registration / login / verification / MFA) into Amplitude and syncs identity-trait changes as user properties so product analysts see the full identity lifecycle in their dashboards.

**Type:** webhook (Ory Action POSTs directly to Amplitude HTTP V2 API — no handler needed)
**Docs page:** [ory.com/docs/integrates-with/cdp-analytics/amplitude](https://www.ory.com/docs/integrates-with/cdp-analytics/amplitude)

## How it works

Configure an Ory Action on each lifecycle hook (async, `response.ignore: true`) with a Jsonnet body that emits an Amplitude HTTP V2 payload, POSTed directly to `https://api2.amplitude.com/2/httpapi`. The Amplitude API key authenticates the request.

No webhook handler required — Amplitude's HTTP V2 API accepts authenticated POSTs directly.

## Setup outline

1. In Amplitude → **Settings** → **Projects** → select project → copy the **API Key** (server-side).
2. Configure Ory Actions for each event:
   - URL: `https://api2.amplitude.com/2/httpapi`.
   - Method: POST.
   - Body Jsonnet: `{ "api_key": "<KEY>", "events": [{ "user_id": ctx.identity.id, "event_type": "ory_registration", "user_properties": { ... } }] }`.
   - `response.ignore: true`.
3. For EU data residency, use `https://api.eu.amplitude.com/2/httpapi`.

## Notable

- **Stable `user_id`** is critical — use Ory's identity id (`ctx.identity.id`), not email, so identity merges work correctly across email changes.
- Set `$set` operations on user properties to **track identity trait changes** without overwriting analytic dimensions Amplitude has computed.
- Rate-limit: Amplitude accepts up to 1,000 events per HTTP request; for high-volume events, batch in a small handler instead of one-event-per-call.

## Status

Community / proposed — no dedicated Ory documentation.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
