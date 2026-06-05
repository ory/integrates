# Splunk

> **Maintained by:** Community contributors

[Splunk](https://splunk.com) is a security information and event management (SIEM) and operational-intelligence platform. This integration forwards Ory identity-flow events (registration, login, recovery, settings) to Splunk's HTTP Event Collector (HEC), shaped to the Common Information Model (CIM) Authentication data model so search, dashboards, and alerts work without per-event extraction.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrates-with/siem-security-analytics/splunk](https://www.ory.com/docs/integrates-with/siem-security-analytics/splunk)

## Use case

A security team needs Ory authentication events in their existing Splunk SIEM so they can run their standard detections (credential stuffing, brute force, impossible travel, MFA-disabled spikes, account-takeover patterns) against identity activity alongside the rest of their telemetry. This integration ships those events to Splunk asynchronously so the SIEM is a sink, never a critical path.

## How it works

1. A user completes a registration, login, recovery, or settings flow in Ory.
2. Ory fires the matching async Action webhook to this handler (`/splunk/registration`, `/splunk/login`, `/splunk/recovery`, or `/splunk/settings`). The handler verifies the shared secret.
3. The handler returns `200` to Ory immediately and constructs a CIM-Authentication-compliant event in the background.
4. The handler POSTs the event to Splunk HEC at `${SPLUNK_HEC_URL}/services/collector/event` with `Authorization: Splunk <token>`. HEC outages are logged and dropped (fire-and-forget) — they never propagate back to Ory.
5. Splunk indexes the event under the configured index/source/sourcetype; CIM-aligned fields (`action`, `app`, `src`, `user`, `authentication_method`, `signature`) make it searchable with stock SPL.

## Prerequisites

- A Splunk instance with HEC enabled and a token configured (Splunk → Settings → Data Inputs → HTTP Event Collector).
- A dedicated index (e.g. `ory`) for these events.
- An Ory Network project.
- A deployment target for the webhook handler (any Node.js runtime: Cloud Run, Heroku, Vercel, Lambda behind API Gateway, your own VM).

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill in ORY_WEBHOOK_SECRET, SPLUNK_HEC_URL, SPLUNK_HEC_TOKEN, and adjust
# SPLUNK_INDEX/SOURCE/SOURCETYPE/HOST as needed.
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /splunk/registration` — Ory post-registration target.
- `POST /splunk/login` — Ory post-login target.
- `POST /splunk/recovery` — Ory post-recovery target.
- `POST /splunk/settings` — Ory post-settings target.

## Configure Ory

1. In the Ory Console, configure the four Action hooks using the snippets in [`ory-actions.yaml`](ory-actions.yaml).
2. The body template is [`jsonnet/event.jsonnet`](jsonnet/event.jsonnet) — shared by all four hooks.
3. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value declared in the hook config.

CIM field mapping, sample SPL detections (credential stuffing, impossible travel, MFA adoption), and Live Event Streams (Enterprise) variant: see the [docs page](https://ory.com/docs/integrates-with/siem-security-analytics/splunk).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match `X-Webhook-Secret` in the Ory hook config.
- **`Splunk HEC 401`** in handler logs — `SPLUNK_HEC_TOKEN` is invalid or disabled in Splunk.
- **`Splunk HEC 403`** — the HEC token isn't authorized for the configured `SPLUNK_INDEX`. Edit the token in Splunk and allow the index.
- **No events appearing in Splunk** — verify HEC is enabled at the global level (Splunk → Settings → Data Inputs → HTTP Event Collector → Global Settings → All Tokens: Enabled) and that the index exists.
- **Events appear but CIM fields are empty** — the Ory payload didn't include `identity.traits.email` or `request_headers["x-forwarded-for"]`. The handler falls back to `"unknown"`.

## License

Apache-2.0. SPDX header at the top of each source file.
