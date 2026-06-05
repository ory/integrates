# Postmark

> **Maintained by:** Ory Engineering

Postmark is a transactional-only email service known for industry-leading deliverability and speed (often seconds). The transactional-only policy keeps shared IP reputation high — well-suited for identity verification/recovery/MFA emails where time-to-inbox matters. **Documented directly in the Ory SMTP courier page.**

**Type:** config (Kratos courier-spi over SMTP — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/email-providers/postmark](https://www.ory.com/docs/integrates-with/email-providers/postmark) — full guide: [ory.com/docs/kratos/emails-sms/sending-emails-smtp#postmark](https://www.ory.com/docs/kratos/emails-sms/sending-emails-smtp#postmark)

| Setting | Value |
| --- | --- |
| Host | `smtp.postmarkapp.com` |
| Port | `587` (STARTTLS) or `465` (TLS) |
| Username | Postmark Server API Token |
| Password | Postmark Server API Token (yes — same value) |

Connection URI:

```
smtps://<SERVER_API_TOKEN>:<SERVER_API_TOKEN>@smtp.postmarkapp.com:465
```

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/kratos/emails-sms/sending-emails-smtp#postmark). Short version:

1. Sign up at [postmarkapp.com](https://postmarkapp.com); create a **Server** for your application.
2. Verify the sender — domain verification (with DKIM CNAMEs) is preferred over per-address sender signatures.
3. Use the Server API Token as **both** the SMTP username and password in the connection URI above.
4. Postmark approves new accounts manually; describe transactional identity emails clearly during signup.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
