# Hookdeck

> **Maintained by:** Community contributors

[Hookdeck](https://hookdeck.com) is a webhook reliability layer — managed ingestion, automatic retries, rate limiting, replay, and observability. Route Ory Network Actions through Hookdeck instead of directly to your handler so transient handler failures don't lose events and so you get a queryable event store of every Ory webhook delivery.

**Type:** config (Ory Action URL points at Hookdeck; Hookdeck forwards to your handler — no webhook code on the Ory side)
**Docs page:** [ory.com/docs/integrates-with/webhook-infrastructure/hookdeck](https://www.ory.com/docs/integrates-with/webhook-infrastructure/hookdeck)

## How it works

```
Ory Action  →  Hookdeck (Source)  →  Hookdeck queue / retry  →  Hookdeck (Destination)  →  Your handler
```

1. In Hookdeck, create a **Source** (HTTP endpoint Hookdeck exposes) and a **Destination** (your handler URL).
2. Connect them with a **Connection** that defines retry policy, filtering, and transformations.
3. Point your Ory Action's webhook URL at the Hookdeck Source URL.
4. Hookdeck buffers events, retries with backoff, and surfaces failures in their dashboard for replay.

## Why route through Hookdeck

- **Handler downtime resilience** — Ory Actions retry per their own policy, but Hookdeck adds a more aggressive retry layer with persistent storage.
- **Event replay** — replay any historical Ory event into your handler from the Hookdeck dashboard, useful during incident recovery.
- **Filtering** — drop events that don't matter (e.g. drop `login.after` for service-account identities) before they reach your handler.
- **Transformations** — reshape the Ory payload to match your handler's expected schema without touching either side.
- **Observability** — every delivery is logged with response status, latency, and retry attempts.

## Setup outline

1. In Hookdeck → **Connections** → **Create connection**: define Source (Ory-facing endpoint) and Destination (your handler).
2. Configure retry policy on the connection (typical: exponential backoff up to 24h).
3. Pass through the **`X-Webhook-Secret`** header from Ory to your handler so signature verification on the handler side still works.
4. Update Ory Action webhook URLs to point at Hookdeck Source URLs.

## Notable

- Hookdeck is **infrastructure**, not an Ory event consumer — your handler still does the work; Hookdeck just makes delivery reliable.
- For very-high-volume products, Hookdeck has connection-rate limits; check the plan limits before adopting.
- Compare with [`webhook-infrastructure/svix`](../svix/) — similar product, different positioning (Svix focuses on outbound webhooks from your product to your customers; Hookdeck focuses on inbound reliability).

## Status

Community / proposed — no dedicated Ory documentation.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
