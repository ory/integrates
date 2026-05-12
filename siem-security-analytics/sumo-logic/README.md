# Sumo Logic

> **Maintained by:** Community contributors

[Sumo Logic](https://www.sumologic.com/) is a cloud-native machine-data analytics platform — log management, Cloud SIEM, observability. Ingest Ory identity events into Sumo Logic via an **HTTP Source** on a Hosted Collector — the simplest ingest path of any SIEM.

**Type:** webhook (Ory Action POSTs directly to Sumo HTTP Source — no handler needed)
**Docs page:** No dedicated Sumo Logic page on ory.com/docs.

## How it works

1. In Sumo Logic, create a **Hosted Collector** → **HTTP Source** — Sumo returns a unique ingest URL.
2. Configure an Ory Action on each lifecycle hook (async, `response.ignore: true`) pointing **directly at the Sumo HTTP Source URL** with a Jsonnet body emitting the event payload as JSON.
3. Sumo automatically parses the JSON, applies the Source Category, and the events become queryable immediately.

No webhook handler required — Sumo's HTTP Source accepts unauthenticated POSTs to the unique tokenized URL.

## Setup outline

1. **Manage Data** → **Collection** → **Add Collector** → **Hosted Collector** (one-time setup).
2. Add an **HTTP Logs & Metrics Source** → set Source Category (e.g. `ory/identity-events`); copy the **HTTP Source URL** (token-bearing).
3. Configure Ory Actions on each event (registration / login / verification / MFA / recovery):
   - URL: the HTTP Source URL.
   - Method: POST.
   - Body: Jsonnet emitting the relevant event fields as JSON.
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
