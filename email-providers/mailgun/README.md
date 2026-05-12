# Mailgun

> **Maintained by:** Ory Engineering

Mailgun is a developer-focused transactional email service with strong deliverability tooling — automatic suppression management, detailed event logs, built-in validation. **Documented directly in the Ory SMTP courier page.**

**Type:** config (Kratos courier-spi over SMTP — no webhook code)
**Docs page:** [ory.com/docs/kratos/emails-sms/sending-emails-smtp#mailgun](https://www.ory.com/docs/kratos/emails-sms/sending-emails-smtp#mailgun)

| Setting | Value |
| --- | --- |
| Host (US) | `smtp.mailgun.org` |
| Host (EU) | `smtp.eu.mailgun.org` |
| Port | `587` (STARTTLS) or `465` (TLS) |
| Username | `postmaster@your-domain.com` (or a custom SMTP user) |
| Password | SMTP password from the Mailgun dashboard |

Connection URI (the `@` in the username MUST be URL-encoded as `%40`):

```
smtp://postmaster%40mg.yourdomain.com:SMTP_PASSWORD@smtp.mailgun.org:587
```

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/kratos/emails-sms/sending-emails-smtp#mailgun). Short version:

1. Sign up at [mailgun.com](https://www.mailgun.com).
2. Add a sending domain and complete DNS verification (SPF, DKIM, MX records). Sandbox domains only deliver to pre-authorized recipients.
3. Use the SMTP credentials shown in the Mailgun dashboard for that domain in the connection URI above.

If your account is in the EU region, swap `smtp.mailgun.org` for `smtp.eu.mailgun.org`.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
