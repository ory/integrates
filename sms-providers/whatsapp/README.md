# WhatsApp Business OTP delivery

> **Maintained by:** Community contributors

WhatsApp does not provide a standard OAuth/OIDC login flow, so "WhatsApp login" in practice means **passwordless OTP delivered through WhatsApp**. This integration uses the same Kratos `courier-spi` HTTP channel that backs Twilio / MessageBird / etc., and routes the OTP through the [WhatsApp Business Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/) using a pre-approved AUTHENTICATION-category template.

**Type:** webhook (Kratos courier HTTP target — *variant of the webhook pattern*)
**Docs page:** [ory.com/docs/integrations/sms-providers/whatsapp](https://ory.com/docs/integrations/sms-providers/whatsapp)

:::info Courier variant, not an Ory Action
This integration is configured via Kratos's `courier.channels` (not `selfservice.flows.<flow>.after.hooks`). The handler shape is the same as a regular Ory webhook — Express + Node + `X-Webhook-Secret` — but the configuration file is `kratos-courier.yaml`, not `ory-actions.yaml`.
:::

## Use case

A consumer product wants WhatsApp as the OTP channel for verification, recovery, and MFA (instead of SMS) — a common request in markets where WhatsApp adoption is higher than SMS deliverability. Kratos generates the OTP exactly as it would for SMS; the integration intercepts the courier delivery, extracts the OTP, and sends it through WhatsApp's Cloud API as an authentication-template message.

## How it works

1. A user enters their phone number on a flow that uses OTP delivery (verification, recovery, or MFA via SMS code).
2. Ory Kratos generates an OTP and POSTs the rendered message to this handler at `/whatsapp/send` (Kratos courier HTTP target).
3. The handler verifies the shared secret, extracts the OTP from the message body using a strict regex (`/\b(?:code|pin|otp)[^\d]{0,16}(\d{4,10})\b/i`), and normalizes the recipient to E.164.
4. The handler POSTs to `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages` with a `type: template` payload, passing the OTP as both the body parameter and the copy-code button parameter.
5. WhatsApp delivers the templated message. The handler returns `200` (with the WhatsApp message id) to Kratos so Kratos marks the delivery as sent.

## Prerequisites

- An Ory Network project (or self-hosted Kratos with HTTP courier configured).
- A Meta Business Manager account with WhatsApp Business enabled.
- A WhatsApp Business phone number ID (the numeric ID, not the phone itself).
- A system-user permanent access token with WhatsApp messaging permission.
- An approved AUTHENTICATION-category template — see the section below.
- A deployment target for the webhook handler.

## Approving the OTP template

WhatsApp Cloud API does not allow ad-hoc text for OTPs. Submit an authentication template:

1. Meta Business Manager → WhatsApp Manager → Message templates → Create template.
2. Category: **Authentication**.
3. Name: `ory_otp` (or whatever matches `WHATSAPP_OTP_TEMPLATE`).
4. Body: `{{1}} is your verification code. For your security, do not share this code.`
5. Add a **Copy code** button — Meta will let you set a single button parameterized with the OTP. The handler sends the OTP to both the body and the button.
6. Submit for review. Approval is usually under an hour.

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill ORY_WEBHOOK_SECRET, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN,
# and (optionally) WHATSAPP_GRAPH_VERSION / WHATSAPP_OTP_TEMPLATE / _LANG.
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /whatsapp/send` — Kratos courier target.

## Configure Kratos

This is a **courier**, not an Ory Action. Use the snippet in [`kratos-courier.yaml`](kratos-courier.yaml) (not `ory-actions.yaml`) under `courier.channels` in your Kratos config. The body template is [`jsonnet/sms-body.jsonnet`](jsonnet/sms-body.jsonnet).

Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `x-webhook-secret` value declared in the Kratos courier config.

WhatsApp Business pricing, template-approval gotchas, and try-WA / fallback-SMS patterns: see the [docs page](https://ory.com/docs/integrations/sms-providers/whatsapp).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` doesn't match `x-webhook-secret` in the Kratos courier config.
- **`401 Unauthorized` from Graph** — access token expired or insufficiently scoped. Use a system-user permanent token with WhatsApp messaging permission.
- **`422 otp_extract_failed`** — the regex didn't find an OTP in the Kratos body. Either change the Kratos verification template, or relax the regex in `extractOtp()` to match your template's wording.
- **`Template name does not exist`** — template name / language code mismatch. The Meta Business Manager values are case-sensitive.
- **`recipient not on WhatsApp`** — the number isn't on WhatsApp. There's no automatic SMS fallback; if your audience may not be on WhatsApp, layer a try-WA / fallback-SMS pattern in your courier config or in this handler.

## License

Apache-2.0. SPDX header at the top of each source file.
