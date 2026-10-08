# Splunk

> **Maintained by:** Community contributors

[Splunk](https://splunk.com) is a security information and event management (SIEM) and operational-intelligence platform. This integration forwards Ory identity-flow events (registration, login, recovery, settings) to Splunk's HTTP Event Collector (HEC), shaped to the Common Information Model (CIM) Authentication data model so search, dashboards, and alerts work without per-event extraction.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrates-with/siem-security-analytics/splunk](https://www.ory.com/docs/integrates-with/siem-security-analytics/splunk)

## Use case

A security team needs Ory authentication events in their existing Splunk SIEM so they can run their standard detections (credential stuffing, brute force, impossible travel, MFA-disabled spikes, account-takeover patterns) against identity activity alongside the rest of their telemetry. This integration ships those events to Splunk asynchronously so the SIEM is a sink, never a critical path.

## How it works

1. A user completes a registration, login, recovery, or settings flow in Ory.
2. Ory fires the matching Action webhook to this handler (`/splunk/registration`, `/splunk/login`, `/splunk/recovery`, or `/splunk/settings`) in the background (`response.ignore: true`), so the flow doesn't wait. The handler verifies the shared secret.
3. The handler answers Ory and constructs a CIM-Authentication-compliant event. The client IP address comes from the `True-Client-Ip` request header that Ory Network sets; Ory doesn't forward `X-Forwarded-For` to webhooks. The authentication method comes from the session, which Ory includes only for login and settings events.
4. The handler POSTs the event to Splunk HEC at `${SPLUNK_HEC_URL}/services/collector/event` with `Authorization: Splunk <token>`. HEC errors are logged and dropped; they never reach Ory.
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

1. Configure the four Action hooks using the snippets in [`ory-actions.yaml`](ory-actions.yaml). Registration and login actions go in the method-specific lists, for example `selfservice.flows.registration.after.password.hooks`; repeat them for every method you enable, such as `oidc`, `code`, or `passkey`. Ory runs the flow-level `after.hooks` list only for a method without its own list, and on Ory Network the password registration list already contains `session`, so keep `session` last. Profile changes use `selfservice.flows.settings.after.profile.hooks`.
2. The body template is [`jsonnet/event.jsonnet`](jsonnet/event.jsonnet), shared by all four hooks. Encode it with `base64 < jsonnet/event.jsonnet | tr -d '\n'` and set `body: base64://<encoded>`; Ory Network doesn't accept `file://` URLs.
3. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value declared in the hook config.

Ory retries a delivery that fails or receives `429` or a `5xx` status other than `501`, up to three attempts within a few seconds. A handler that doesn't respond within about 30 seconds times out.

### Without the handler

Ory Actions can also POST directly to HEC: point the action at `https://<splunk-host>:8088/services/collector/event`, use `api_key` auth with `name: Authorization`, `value: Splunk <your-hec-token>`, and `in: header`, and let the body Jsonnet build the HEC envelope. The HEC endpoint must be reachable from Ory Network over HTTPS with a publicly trusted certificate. See the [docs page](https://www.ory.com/docs/integrates-with/siem-security-analytics/splunk) for a complete example.

CIM field mapping, sample SPL detections (credential stuffing, impossible travel, MFA adoption), and Live Event Streams (Enterprise) variant: see the [docs page](https://www.ory.com/docs/integrates-with/siem-security-analytics/splunk).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match `X-Webhook-Secret` in the Ory hook config.
- **`Splunk HEC 401`** in handler logs — `SPLUNK_HEC_TOKEN` is invalid or disabled in Splunk.
- **`Splunk HEC 403`** — the HEC token isn't authorized for the configured `SPLUNK_INDEX`. Edit the token in Splunk and allow the index.
- **No events appearing in Splunk** — verify HEC is enabled at the global level (Splunk → Settings → Data Inputs → HTTP Event Collector → Global Settings → All Tokens: Enabled) and that the index exists.
- **Events appear but CIM fields are empty** — the identity has no `email` trait, or the request had no `True-Client-Ip` header. The handler falls back to `"unknown"`.

## License

Apache-2.0. SPDX header at the top of each source file.
