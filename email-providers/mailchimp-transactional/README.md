# Mailchimp Transactional (Mandrill)

> **Maintained by:** Community contributors

Mailchimp Transactional (formerly Mandrill) is the transactional email service built into the Mailchimp platform — a natural choice when the marketing side already runs on Mailchimp and you want shared billing, sender reputation, and dashboards.

> This is the **transactional / courier** integration. For syncing newly registered users into a Mailchimp **marketing audience** via Ory Actions, see [`cdp-analytics/mailchimp`](../../cdp-analytics/mailchimp/).

**Type:** config (Kratos courier-spi over SMTP — no webhook code)
**Docs page:** No dedicated section in the Ory docs; configures as a [generic SMTP courier](https://www.ory.com/docs/kratos/emails-sms/sending-emails-smtp#your-own-server).

| Setting | Value |
| --- | --- |
| Host | `smtp.mandrillapp.com` |
| Port | `587` (STARTTLS), `465` (TLS), or `2525` (alternative) |
| Username | Any string (Mandrill ignores it but it must be present — `apikey` is conventional) |
| Password | Mandrill API key |

Connection URI:

```
smtps://apikey:md-xxxxxxxxxxxxxxxxxxxx@smtp.mandrillapp.com:465
```

## Setup

1. Enable the **Transactional Email** add-on in your Mailchimp account, or sign up directly at [mandrillapp.com](https://mandrillapp.com). Mandrill is a paid add-on requiring a transactional email block purchase.
2. Verify the sending domain in Mandrill — add SPF (`include:spf.mandrillapp.com`) and DKIM TXT records to DNS.
3. Generate an API key from **Settings → SMTP & API Info** and use it as the SMTP password in the connection URI above.

> **Don't** use Mandrill's server-side templates for Ory identity emails — Ory renders templates before handing the message to SMTP.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
