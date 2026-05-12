# SendGrid

> **Maintained by:** Ory Engineering

SendGrid (a Twilio company) is one of the most widely used transactional-email platforms — robust SMTP relay, HTTP API, and a generous free tier. **Documented directly in the Ory SMTP courier page.**

**Type:** config (Kratos courier-spi over SMTP or HTTP — no webhook code)
**Docs page:** [ory.com/docs/kratos/emails-sms/sending-emails-smtp#sendgrid](https://www.ory.com/docs/kratos/emails-sms/sending-emails-smtp#sendgrid)

The Ory docs page covers both SMTP and HTTP variants for SendGrid. Quick reference:

| Setting | Value |
| --- | --- |
| SMTP host | `smtp.sendgrid.net` |
| SMTP port | `587` (STARTTLS) or `465` (TLS) |
| SMTP user | `apikey` (literal string — not your key name) |
| SMTP password | Your SendGrid API key with **Mail Send** permission |
| HTTP endpoint | `POST https://api.sendgrid.com/v3/mail/send` with `Authorization: Bearer <API_KEY>` |

Connection URI:

```
smtps://apikey:SG.xxxxxxxx@smtp.sendgrid.net:465
```

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/kratos/emails-sms/sending-emails-smtp#sendgrid). Short version:

1. Sign up at [sendgrid.com](https://sendgrid.com); create an API key in Settings → API Keys with **Mail Send** permission.
2. Verify a sender — domain authentication (SPF + DKIM via CNAME records) is strongly recommended over single-sender verification.
3. Configure the courier in Ory Console (Email Configuration) or via CLI using the connection URI above.

> **Don't** use SendGrid's dynamic templates for Ory identity emails — Ory renders templates before sending and SendGrid receives the final content.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
