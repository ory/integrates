# Amazon SES

> **Maintained by:** Ory Engineering

Amazon Simple Email Service (SES) is AWS's transactional/marketing email service — high deliverability, pay-per-use pricing, deep AWS integration. **Documented directly in the Ory SMTP courier page.** Natural choice when the rest of the stack is on AWS.

**Type:** config (Kratos courier-spi over SMTP — no webhook code)
**Docs page:** [ory.com/docs/kratos/emails-sms/sending-emails-smtp#aws-ses](https://www.ory.com/docs/kratos/emails-sms/sending-emails-smtp#aws-ses)

| Setting | Value |
| --- | --- |
| Host | `email-smtp.<region>.amazonaws.com` |
| Port | `587` (STARTTLS) or `465` (TLS) |
| Username | SES SMTP username (generated in SES console — **NOT the same as IAM access key**) |
| Password | SES SMTP password (URL-encode `+`, `/`, `=` as `%2B`, `%2F`, `%3D`) |

Connection URI:

```
smtps://AKIAxxx:<URL-encoded-password>@email-smtp.us-east-1.amazonaws.com:465
```

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/kratos/emails-sms/sending-emails-smtp#aws-ses). Short version:

1. Enable SES in your target region. **Request production access** — new accounts are sandboxed (only deliver to verified recipients).
2. Verify a sending domain (or address). Enable **Easy DKIM** and add the three CNAME records to DNS.
3. In the SES console, generate **SMTP credentials** (these wrap an IAM user but produce a distinct SMTP username/password — don't try to reuse your IAM access key directly).
4. Configure the courier with the connection URI above. URL-encode the SMTP password.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
