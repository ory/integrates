# <Integration Name>

> **Maintained by:** <Ory Engineering | Community contributors | @your-github-handle>

<!-- One paragraph: what does this integration do, and why would someone deploy it? -->

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrates-with/<your-integration>](https://ory.com/docs/integrates-with/)

## Use case

<!-- 2-3 sentences. Concrete scenario where a customer would deploy this. -->

## How it works

1. <First thing that happens — a user action in the Ory-powered application>
2. <Ory fires an Action webhook to the deployed handler>
3. <Handler authenticates the request and calls the third-party API>
4. <Result in the third-party system>

## Prerequisites

- An Ory Network project (free dev projects are fine for testing)
- An account with <vendor> with API access
- A deployment target for the webhook (anything that runs Node.js: Cloud Run, Heroku, Vercel, Lambda behind API Gateway, your own VM)

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill in the values in .env
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:
- `GET /health` — readiness check
- `POST /<integration>/<endpoint>` — Ory webhook target

## Configure Ory

1. In the Ory Console, configure an Action hook using the snippet in [`ory-actions.yaml`](ory-actions.yaml).
2. The body template is [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet) — adjust as needed.
3. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value declared in the Ory hook config.

Detailed setup with screenshots: see the [docs page](https://ory.com/docs/integrates-with/).

## Troubleshooting

- **401 from the handler** — `X-Webhook-Secret` mismatch.
- **Vendor API errors** — see the vendor's documentation for rate limits and error codes.
- **Webhook not firing** — confirm the Ory hook is enabled and the URL is reachable from the public internet.

## License

Apache-2.0. SPDX header at the top of each source file.
