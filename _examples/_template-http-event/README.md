# <Integration Name>

> **Maintained by:** <Ory Engineering | Community contributors | @your-github-handle>

<!-- One paragraph: what does this integration do? -->

**Type:** http-event (consumer of Ory Network Live Events via HTTP POST)
**Docs page:** [ory.com/docs/integrations/<your-integration>](https://ory.com/docs/integrations/)

> Live event streams are an **Ory Network Enterprise** feature. This integration requires an Enterprise Ory Network contract. See the [Ory Network plans](https://www.ory.sh/pricing).

## Use case

<!-- 2-3 sentences. -->

## How it works

1. Ory Network emits a [live event](https://www.ory.sh/docs/kratos/manage-identities/event-streams) (e.g. `IdentityCreated`, `LoginSucceeded`) when a relevant flow completes.
2. Ory POSTs the event to this handler's endpoint.
3. The handler authenticates with HTTP Basic Auth (credentials embedded in the configured event-stream URL).
4. The handler dedupes the event by SHA-256 of the body to tolerate Ory's at-least-once delivery semantics.
5. The handler dispatches to the right per-event handler and forwards to the third-party system.
6. Handler always returns 200 — Ory discards the response body for live events.

## Subscribed events

This integration consumes:
- `IdentityCreated` — <handler behavior>
- `LoginSucceeded` — <handler behavior>
- <add as needed>

## Prerequisites

- An Ory Network **Enterprise** project with live event streams enabled
- An account with <vendor>
- A Node.js 20+ deployment target

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill in the values in .env
npm install
npm start
```

The handler exposes:
- `GET /health` — readiness check
- `POST /events` — Ory event-stream target (HTTP Basic Auth required)

## Configure Ory

1. Configure the event-stream target URL with embedded Basic Auth credentials, using the snippet in [`ory-event-stream.yaml`](ory-event-stream.yaml). Format: `https://<user>:<password>@your-handler.example.com/events`.
2. Set `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` in the handler's `.env` to match.
3. (Recommended) Configure the event filter on the Ory side to send only the events this handler consumes — see [`ory-event-stream.yaml`](ory-event-stream.yaml).

## Idempotency

Live events are delivered **at least once** with no ordering guarantees. This handler keeps an in-memory `Map` of recently-seen event hashes (sha256 of the body) for 5 minutes. For production, swap to Redis or DynamoDB; see the comment block at the top of `webhook/idempotency.js`.

## Troubleshooting

- **401 from the handler** — Basic Auth credentials in the Ory event-stream URL don't match the handler's `.env`.
- **Duplicate side effects** — confirm `idempotency.js` is wired up and remembers events for at least the duration between Ory retries.
- **Out-of-order events** — the handler should be event-type aware. For example, `LoginSucceeded` for a user before `IdentityCreated` is delivered first; either tolerate it (queue + retry) or design the downstream operation to be commutative.

## License

Apache-2.0.
