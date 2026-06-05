# Clearbit (DEPRECATED)

> **Maintained by:** Community contributors

> ⚠️ **Deprecated.** HubSpot acquired Clearbit in late 2023 and has folded its capabilities into Breeze Intelligence, a HubSpot CRM UI feature with no external API. Standalone Clearbit API access is no longer offered to new customers. This integration is preserved for legacy Clearbit contracts only. For new deployments, see [`user-enrichment/fullcontact`](../fullcontact/) or [`user-enrichment/zoominfo`](../zoominfo/).

Clearbit enriches identities with company and person data from an email address. This integration runs an async post-registration webhook that calls Clearbit's Combined API and writes the result to the identity's `metadata_admin` via the Ory Admin API.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrates-with/user-enrichment/clearbit](https://www.ory.com/docs/integrates-with/user-enrichment/clearbit)

## Use case

A B2B SaaS wants firmographic and demographic context (company name, industry, headcount, role, seniority) on every signup so sales can route enterprise leads and product can gate features by company size — without making the user fill out a long form. The enrichment runs in the background after registration and is available on the identity by the time the user reaches the dashboard.

## How it works

1. A user registers with their work email through an Ory flow.
2. Ory fires the async post-registration Action webhook to this handler. The hook is `response.ignore: true, can_interrupt: false`, so the user's registration completes immediately.
3. The handler verifies the shared secret and returns `200` to Ory right away.
4. In the background, the handler calls Clearbit's `/v2/combined/find` endpoint with the user's email.
5. If Clearbit has data, the handler fetches the current identity through the Ory Admin API, merges the projected enrichment into `metadata_admin.clearbit`, and PUTs the identity back.

## Prerequisites

- A legacy Clearbit contract with a working API key. **New customers cannot purchase this**.
- An Ory Network project and an admin API key with identity read/write scope.
- A deployment target for the webhook handler (any Node.js runtime: Cloud Run, Heroku, Vercel, Lambda behind API Gateway, your own VM).

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill in ORY_WEBHOOK_SECRET, CLEARBIT_API_KEY, ORY_SDK_URL, ORY_ADMIN_API_KEY
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /clearbit/registration` — Ory async post-registration Action target.

## Configure Ory

1. In the Ory Console, configure the async post-registration Action hook using [`ory-actions.yaml`](ory-actions.yaml).
2. The body template is [`jsonnet/registration.jsonnet`](jsonnet/registration.jsonnet).
3. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value declared in the hook config.
4. Provision an admin API key for the handler (Ory Console → API Keys) and set `ORY_ADMIN_API_KEY` and `ORY_SDK_URL` in `.env`.

Detailed setup, response shape, and migration guidance to FullContact or ZoomInfo: see the [docs page](https://ory.com/docs/integrates-with/user-enrichment/clearbit).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match the `X-Webhook-Secret` value in the Ory hook config.
- **`Clearbit 401`** in logs — the `CLEARBIT_API_KEY` is invalid or the key's contract has lapsed (most likely cause in 2026).
- **No `metadata_admin.clearbit` appearing on identities** — check handler logs for `Clearbit: no data for <email>` (free email providers like `@gmail.com` have no data) or `Ory put identity ...` failures (admin key scope insufficient).
- **`Ory get identity 404`** — the handler is calling the wrong `ORY_SDK_URL` for the project the webhook is configured in.

## License

Apache-2.0. SPDX header at the top of each source file.
