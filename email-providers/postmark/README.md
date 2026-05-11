# Postmark — Email Provider Integration for Ory Network

## Overview

Postmark is a transactional email service known for exceptional deliverability and speed. Unlike general-purpose email platforms, Postmark focuses exclusively on transactional email, enforcing strict sending policies that result in consistently high inbox placement rates. It is an excellent choice for identity-related emails where delivery speed and reliability are paramount.

## Integration Architecture

Ory Kratos uses its built-in Courier to send transactional emails. On Ory Network, the Courier connects to Postmark's SMTP endpoint to deliver verification, recovery, and MFA emails.

```
User Action (e.g., email verification)
        │
        ▼
   Ory Kratos
        │
        ▼
  Courier (SMTP client)
        │
        ▼
  Postmark SMTP Endpoint
        │
        ▼
  Recipient Inbox
```

## Prerequisites

1. **Postmark account** — Sign up at [postmarkapp.com](https://postmarkapp.com).
2. **Server and API token** — Create a server in Postmark for your application. Each server has a unique API token that also serves as the SMTP password.
3. **Verified sender** — Verify either a sender signature (individual email address) or an entire domain. Domain verification provides DKIM signing and is recommended.
4. **Approved account** — Postmark reviews new accounts. Ensure your use case (transactional identity emails) is clearly described during setup.

## Configuration

### Ory Network SMTP Connection String

**Connection string format:**

```
smtps://{SERVER_API_TOKEN}:{SERVER_API_TOKEN}@smtp.postmarkapp.com:465
```

Or using STARTTLS on port 587:

```
smtp://{SERVER_API_TOKEN}:{SERVER_API_TOKEN}@smtp.postmarkapp.com:587
```

> **Note:** Postmark uses the Server API Token as both the SMTP username and password.

**Example:**

```
smtps://xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx@smtp.postmarkapp.com:465
```

**Using the Ory CLI:**

```bash
ory patch identity-config <project-id> \
  --replace '/courier/smtp/connection_uri="smtps://SERVER_TOKEN:SERVER_TOKEN@smtp.postmarkapp.com:465"' \
  --replace '/courier/smtp/from_address="noreply@yourdomain.com"' \
  --replace '/courier/smtp/from_name="Your App"'
```

### Sender Address

The `from_address` must match a verified sender signature or belong to a verified domain in your Postmark account.

## Technical Details

### SMTP Settings

| Setting        | Value                                  |
|----------------|----------------------------------------|
| Host           | `smtp.postmarkapp.com`                 |
| Port (TLS)     | `465`                                  |
| Port (STARTTLS)| `587`                                  |
| Port (plain)   | `25` (not recommended)                 |
| Encryption     | TLS (port 465) or STARTTLS (port 587)  |
| Authentication | PLAIN or CRAM-MD5                      |
| Username       | Server API Token                       |
| Password       | Server API Token                       |

### API Alternative

Postmark provides a REST API for sending email, which supports features like message streams, template rendering, and metadata. Ory Network uses SMTP natively, so the API is not required for the standard integration. However, the API can be useful for:

- Querying delivery status and bounce information
- Managing suppressions
- Using Postmark's server-side templates (separate from Ory templates)

**API endpoint:** `https://api.postmarkapp.com/email`

### Message Streams

Postmark organizes sending into message streams. Transactional emails (the default stream) and broadcast emails are separated. Ory identity emails are transactional and will use the default transactional stream automatically.

## Email Template Customization

Email templates are managed in Ory Network. Postmark receives fully rendered HTML and plain text via SMTP and delivers them without modification.

Customize templates in Ory:

```bash
ory patch identity-config <project-id> \
  --replace '/courier/templates/verification/valid/email/body/html="<html><body>Your code: {{ .VerificationCode }}</body></html>"' \
  --replace '/courier/templates/verification/valid/email/subject="Verify your email"'
```

Refer to the [Ory email template documentation](https://www.ory.sh/docs/kratos/emails-sms/custom-email-templates) for template variables and syntax.

## Deliverability Considerations

1. **Transactional-only policy** — Postmark enforces transactional-only sending, which keeps shared IP reputation exceptionally high. Identity emails are a perfect fit.
2. **DKIM** — Set up domain verification in Postmark to enable DKIM signing. Add the provided DNS records.
3. **SPF** — Not strictly required for Postmark (they use DKIM and Return-Path alignment), but adding their SPF include is good practice.
4. **DMARC** — Configure a DMARC record for your domain.
5. **Return-Path** — Postmark supports custom Return-Path domains for improved DMARC alignment. Configure this in the domain settings.
6. **Bounce handling** — Postmark automatically tracks bounces and deactivates addresses that hard-bounce, protecting your reputation.
7. **Speed** — Postmark is known for industry-leading delivery speed, often delivering within seconds. This is especially valuable for time-sensitive verification and recovery emails.

## Testing

1. **Postmark sandbox** — Use Postmark's test server token for development. Emails sent with the test token are accepted but not delivered.
2. **Activity feed** — The Postmark dashboard shows real-time delivery activity, including full message content, headers, and delivery timestamps.
3. **Ory self-service flows** — Trigger a verification or recovery flow and verify delivery in the Postmark activity feed.
4. **Bounce testing** — Postmark provides test addresses for simulating bounces and spam complaints.

## Resources

- [Ory Docs — Postmark SMTP Configuration](https://www.ory.sh/docs/kratos/emails-sms/sending-emails-smtp#postmark)
- [Ory Docs — Sending Emails via SMTP](https://www.ory.sh/docs/kratos/emails-sms/sending-emails-smtp)
- [Ory Docs — Custom Email Templates](https://www.ory.sh/docs/kratos/emails-sms/custom-email-templates)
- [Postmark Developer Documentation](https://postmarkapp.com/developer)
- [Postmark SMTP Guide](https://postmarkapp.com/developer/user-guide/send-email-with-smtp)
- [Postmark API Reference](https://postmarkapp.com/developer/api/overview)
