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

1. Configure an Action hook using the snippet in [`ory-actions.yaml`](ory-actions.yaml). Attach `after` actions of the registration, login, and settings flows to the method-specific lists, not to the flow-level `after.hooks` lists:
   - Registration: `selfservice.flows.registration.after.<method>.hooks` for each sign-up method you enable, such as `password` and `oidc`. On Ory Network, the `password` list contains `session`; keep it last.
   - Login: `selfservice.flows.login.after.<method>.hooks` for each sign-in method.
   - Profile updates: `selfservice.flows.settings.after.profile.hooks`.

   Recovery and verification have only flow-level lists, such as `selfservice.flows.verification.after.hooks`. See [Attach `after` actions to authentication methods](https://www.ory.com/docs/kratos/hooks/configure-hooks#attach-after-actions-to-authentication-methods).
2. The body template is [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet) — adjust as needed. Ory Network doesn't accept `file://` bodies, so set `body` to `base64://` followed by the Base64-encoded template. Read optional fields with `std.get`: Jsonnet fails on a missing field, and Ory then drops the request or fails the flow. The webhook context never contains `metadata_admin`, and its request headers don't include `X-Forwarded-For`; read the client IP address from `True-Client-Ip`.
3. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value declared in the Ory hook config. Ory webhooks authenticate only with `api_key` or `basic_auth`.

## Webhook behavior

- `response.ignore: true` sends the request in the background. Ory doesn't wait for the handler and ignores its response. Use it for every webhook that only notifies another system.
- Without `response.ignore` or `response.parse`, a registration or settings webhook runs after the identity is saved. A response with status `400` or higher still fails the user's request, even though the change is saved.
- With `response.parse: true`, a registration or settings webhook runs before the identity is saved. In registration, `identity.id` is `00000000-0000-0000-0000-000000000000` at that point, so don't use it as a key in other systems. A `200` response with an `identity` object changes the identity; each field you return replaces the whole field, for example all of `metadata_public`. In the login flow, those changes apply only to that login's response and aren't saved.
- To block the flow and tell the user why, set `response.parse: true` and respond with a `4xx` status other than `429`, with this body:

  ```json
  {
    "messages": [
      {
        "instance_ptr": "#/traits/email",
        "messages": [{ "id": 10000001, "text": "Only employees can sign up.", "type": "error", "context": {} }]
      }
    ]
  }
  ```

  Use `#/` as `instance_ptr` for a message about the whole form. A `4xx` response without this shape fails the flow without showing the user a reason.
- Ory retries a request that can't be delivered, or that receives a `429` or `5xx` status other than `501`, for up to three attempts in total within a few seconds. All attempts for one trigger carry the same `Ory-Webhook-Trigger-Id` header.
- The handler must respond within about 30 seconds.

Detailed setup with screenshots: see the [docs page](https://ory.com/docs/integrates-with/).

## Troubleshooting

- **401 from the handler** — `X-Webhook-Secret` mismatch.
- **Vendor API errors** — see the vendor's documentation for rate limits and error codes.
- **Webhook not firing** — confirm the Ory hook is enabled and the URL is reachable from the public internet.

## License

Apache-2.0. SPDX header at the top of each source file.
