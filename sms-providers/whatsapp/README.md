# WhatsApp Business — OTP Delivery (Ory Network Integration)

> **Maintained by:** Community contributors

## Overview

WhatsApp does not provide a standard OAuth/OIDC login flow, so "WhatsApp login" in practice means **passwordless OTP delivered through WhatsApp**. This integration takes the same Kratos `courier-spi` mechanism used for Twilio, MessageBird, etc., and routes the OTP through the **WhatsApp Business Cloud API** instead, using a pre-approved AUTHENTICATION-category template.

The user's UX:

1. They enter a phone number.
2. Ory Kratos generates an OTP and asks the courier to send it.
3. The courier POSTs the message to this handler.
4. The handler extracts the OTP from the rendered message body and sends it via WhatsApp Cloud API as a templated authentication message.
5. The user copies (or taps the copy-code button on) the OTP and submits it back to Ory.
6. Ory verifies and starts a session.

```
Ory Kratos courier
  POST /whatsapp/send  (X-Webhook-Secret, jsonnet body: { recipient, body, message_type })
        ↓
  Handler extracts OTP from body
        ↓
  POST https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages
       template: { name: ory_otp, parameters: [<OTP>] }
        ↓
  WhatsApp delivers to recipient
        ↓
  Handler returns 200 to Kratos
```

## Prerequisites

- Ory Network project (or self-hosted Kratos with HTTP courier configured)
- **Meta Business Manager account** with WhatsApp Business
- A **WhatsApp Business phone number ID** (the numeric ID, not the phone itself)
- A **system-user permanent access token** with WhatsApp messaging permission
- An **approved AUTHENTICATION-category template** — see "Approving the OTP template" below
- Deployment target for the handler

## Approving the OTP template

WhatsApp Cloud API does not allow ad-hoc text for OTPs. You must submit and get approval for an authentication-category template:

1. **Meta Business Manager → WhatsApp Manager → Message templates → Create template.**
2. Category: **Authentication**.
3. Name: `ory_otp` (or whatever matches `WHATSAPP_OTP_TEMPLATE` in `.env`).
4. Body:
   ```
   {{1}} is your verification code. For your security, do not share this code.
   ```
5. (Recommended) Add a **Copy code** button — Meta Business Manager will let you set a single button that takes the OTP as its parameter. The handler sends the OTP to both the body and the button.
6. Submit for review. Approval is usually under an hour.

If you use a different template name or language, set `WHATSAPP_OTP_TEMPLATE` and `WHATSAPP_OTP_TEMPLATE_LANG` accordingly.

## Deploy

```bash
cd webhook/
cp .env.example .env
# Fill WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN,
# WHATSAPP_OTP_TEMPLATE (default: ory_otp), WHATSAPP_OTP_TEMPLATE_LANG (default: en_US),
# ORY_WEBHOOK_SECRET
npm install
node server.js
```

Endpoints:

- `GET /health` — readiness check
- `POST /whatsapp/send` — courier target (called by Kratos)

## Configure Kratos

Use the snippet in [`kratos-courier.yaml`](kratos-courier.yaml) for your `/courier/channels` config. The body template is [`jsonnet/sms-body.jsonnet`](jsonnet/sms-body.jsonnet).

## Caveats — read before shipping

- **Pricing.** WhatsApp Business pricing is **not** the same as SMS pricing and varies by destination country. Authentication-category messages have specific rates that you must validate against your unit economics.
- **Number must be on WhatsApp.** If the user's phone number does not have a WhatsApp account, delivery fails. There is no automatic fallback to SMS — that's the customer's responsibility (a "try-WA, fallback-SMS" pattern is straightforward to layer in this handler if you need it).
- **Template content matters.** Meta enforces strict template categories. Authentication templates are intentionally narrow. Don't try to pack marketing content into the OTP template — it will get rejected.
- **OTP extraction.** The handler regex finds `(?:code|pin|otp)` followed by 4–10 digits. If you customize Kratos's verification message body, validate the regex still matches; otherwise extend the regex or change the jsonnet body to pass the OTP separately.
- **24-hour rule.** You can only send a free-form text message after the user messages your business first. OTP authentication templates are exempt — that's why this integration is template-only.
- **Quality rating.** Meta tracks message quality. Don't send to invalid numbers; cap retries; log delivery failures.

## Troubleshooting

- **`401 Unauthorized` from Graph** — access token expired or insufficiently scoped. Use a system-user permanent token with WhatsApp messaging permission.
- **`Template name does not exist`** — template name or language code mismatch. The values in Meta Business Manager are case-sensitive.
- **`otp_extract_failed`** — the regex didn't find an OTP in the Kratos body. Either change the Kratos verification template, or relax the regex in `extractOtp()`.
- **Delivery fails with `recipient not on WhatsApp`** — exactly what it says. Implement an SMS fallback if your audience may not be on WhatsApp.

## Resources

- [WhatsApp Cloud API — send messages](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages)
- [WhatsApp authentication templates guide](https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates)
- [Meta Business Manager — system users](https://business.facebook.com/business/help/2300766026988145)
- [Ory courier docs (HTTP / SMS)](https://www.ory.com/docs/kratos/emails-sms/sending-sms)
