# Mailgun — Email Provider Integration for Ory Network

## Overview

Mailgun is an email delivery service built for developers, offering both SMTP and REST API interfaces. It provides robust email sending, tracking, and analytics capabilities. Mailgun is well-suited for transactional email with strong deliverability tooling, including automatic suppression management, detailed event logs, and built-in email validation.

## Integration Architecture

Ory Kratos uses its built-in Courier to send transactional emails. On Ory Network, the Courier connects to Mailgun's SMTP endpoint to deliver messages such as verification codes, recovery links, and MFA codes.

```
User Action (e.g., password recovery)
        │
        ▼
   Ory Kratos
        │
        ▼
  Courier (SMTP client)
        │
        ▼
  Mailgun SMTP Endpoint
        │
        ▼
  Recipient Inbox
```

## Prerequisites

1. **Mailgun account** — Sign up at [mailgun.com](https://www.mailgun.com). A free tier is available for testing.
2. **Verified domain** — Add and verify a custom sending domain in Mailgun. This requires adding DNS records (SPF, DKIM, MX) to your domain.
3. **SMTP credentials** — Mailgun provides SMTP credentials per domain. The default SMTP user is `postmaster@your-domain.com`. You can also create additional SMTP users in the Mailgun dashboard.
4. **API key** (optional) — Available from the Mailgun dashboard under API Security. Needed only if using the API directly.

## Configuration

### Ory Network SMTP Connection String

**Connection string format:**

```
smtp://{SMTP_USER}:{SMTP_PASSWORD}@smtp.mailgun.org:587
```

Or using TLS on port 465:

```
smtps://{SMTP_USER}:{SMTP_PASSWORD}@smtp.mailgun.org:465
```

**Example:**

```
smtp://postmaster%40mg.yourdomain.com:your-mailgun-smtp-password@smtp.mailgun.org:587
```

> **Important:** The SMTP username contains an `@` symbol, which must be URL-encoded as `%40` in the connection string.

**Using the Ory CLI:**

```bash
ory patch identity-config <project-id> \
  --replace '/courier/smtp/connection_uri="smtp://postmaster%40mg.yourdomain.com:SMTP_PASSWORD@smtp.mailgun.org:587"' \
  --replace '/courier/smtp/from_address="noreply@yourdomain.com"' \
  --replace '/courier/smtp/from_name="Your App"'
```

### EU Region

If your Mailgun account is in the EU region, use the EU SMTP endpoint:

```
smtp://{SMTP_USER}:{SMTP_PASSWORD}@smtp.eu.mailgun.org:587
```

## Technical Details

### SMTP Settings

| Setting        | Value                                      |
|----------------|--------------------------------------------|
| Host (US)      | `smtp.mailgun.org`                         |
| Host (EU)      | `smtp.eu.mailgun.org`                      |
| Port (STARTTLS)| `587`                                      |
| Port (TLS)     | `465`                                      |
| Port (plain)   | `25` (not recommended)                     |
| Encryption     | STARTTLS (port 587) or TLS (port 465)      |
| Authentication | PLAIN or LOGIN                             |
| Username       | `postmaster@your-domain.com` or custom     |
| Password       | SMTP password from Mailgun dashboard       |

### API Alternative

Mailgun's REST API is a powerful alternative to SMTP, supporting features like tagging, tracking, and scheduled sending. However, Ory Network's Courier uses SMTP natively. The API is useful if you build a custom courier or need to interact with Mailgun for other purposes (log retrieval, suppression management, etc.).

**API base URLs:**

- US: `https://api.mailgun.net/v3/`
- EU: `https://api.eu.mailgun.net/v3/`

## Email Template Customization

Email templates are managed in Ory Network, not in Mailgun. Ory Kratos sends fully rendered HTML and plain text to Mailgun via SMTP. Mailgun acts as a transport layer.

Customize templates via the Ory Console or CLI:

```bash
ory patch identity-config <project-id> \
  --replace '/courier/templates/recovery/valid/email/body/html="<html><body>Reset: {{ .RecoveryURL }}</body></html>"' \
  --replace '/courier/templates/recovery/valid/email/subject="Reset your password"'
```

Refer to the [Ory email template documentation](https://www.ory.sh/docs/kratos/emails-sms/custom-email-templates) for full details on template variables and syntax.

## Deliverability Considerations

1. **Domain verification** — Complete DNS verification (SPF, DKIM, CNAME tracking) in Mailgun. This is critical for deliverability.
2. **SPF** — Add Mailgun's SPF include (`include:mailgun.org`) to your domain's SPF record.
3. **DKIM** — Mailgun generates DKIM keys during domain setup. Add the provided TXT records to your DNS.
4. **DMARC** — Set up a DMARC record for your domain to improve trust and reduce spoofing risk.
5. **Dedicated IP** — Available on paid plans. Recommended for high-volume sending to maintain independent reputation.
6. **Suppression management** — Mailgun automatically manages bounce, complaint, and unsubscribe lists. Emails to suppressed addresses are blocked, protecting your sender reputation.
7. **IP warmup** — If using a dedicated IP, Mailgun offers automatic IP warmup to gradually build reputation.

## Testing

1. **Mailgun sandbox domain** — New accounts include a sandbox domain for testing. Only authorized recipients can receive from the sandbox.
2. **Mailgun logs** — The Mailgun dashboard provides detailed event logs (delivered, opened, clicked, bounced, failed) for every message.
3. **Ory self-service flows** — Trigger verification or recovery flows in your application and confirm delivery in the Mailgun logs.
4. **Email preview** — Use tools like Litmus or Mailtrap alongside your Ory templates to verify rendering before going live.

## Resources

- [Ory Docs — Mailgun SMTP Configuration](https://www.ory.sh/docs/kratos/emails-sms/sending-emails-smtp#mailgun)
- [Ory Docs — Sending Emails via SMTP](https://www.ory.sh/docs/kratos/emails-sms/sending-emails-smtp)
- [Ory Docs — Custom Email Templates](https://www.ory.sh/docs/kratos/emails-sms/custom-email-templates)
- [Mailgun Documentation](https://documentation.mailgun.com/)
- [Mailgun SMTP Reference](https://documentation.mailgun.com/en/latest/user_manual.html#sending-via-smtp)
- [Mailgun API Reference](https://documentation.mailgun.com/en/latest/api_reference.html)
