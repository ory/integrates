# mParticle

> **Maintained by:** Community contributors

[mParticle](https://www.mparticle.com) is a customer data platform (CDP). This integration sends Ory identity and authentication events into mParticle via the Events API for server-to-server integration. From mParticle, events fan out to downstream destinations (analytics, marketing, advertising platforms) without re-implementing each integration.

**Type:** webhook (Ory Action POSTs directly to mParticle Events API — no handler needed)
**Docs page:** No dedicated mParticle page on ory.com/docs.

## How it works

Configure an Ory Action on each lifecycle hook (async, `response.ignore: true`) with a Jsonnet body that emits an mParticle Events API payload, POSTed directly to `https://s2s.mparticle.com/v2/events` with HTTP Basic auth (mParticle API Key + Secret).

## Setup outline

1. In mParticle → **Setup** → **Inputs** → create a **Custom Feed** (Platform: Custom). Copy the **API Key** and **API Secret**.
2. Configure Ory Actions for each event:
   - URL: `https://s2s.mparticle.com/v2/events`.
   - Method: POST with `Content-Type: application/json`.
   - Auth: HTTP Basic with `API Key:API Secret`.
   - Body Jsonnet: `{ "events": [{ "event_type": "custom_event", "data": { "event_name": "ory_registration", "custom_event_type": "other" } }], "user_identities": { "customer_id": ctx.identity.id, "email": ctx.identity.traits.email }, "environment": "production" }`.
   - `response.ignore: true`.
3. Configure outputs in mParticle to route Ory events to whichever downstream destinations you use.

## Notable

- **`user_identities.customer_id`** — use Ory's identity id; mParticle's identity resolution rules can be configured on top.
- **`environment`** — set to `"development"` for non-prod Ory projects so events don't pollute prod data.
- mParticle's value is the **routing layer** — for a single destination (just Amplitude, just Mixpanel) you might skip mParticle and ingest directly; for multi-destination, the integration pays off quickly.

## Status

Community / proposed — no dedicated Ory documentation.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
