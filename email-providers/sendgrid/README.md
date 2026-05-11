# SendGrid — Email Provider Integration for Ory Network

## Overview

SendGrid (a Twilio company) is one of the most widely used email delivery platforms, supporting both transactional and marketing email. It offers a robust SMTP relay, a REST API, and extensive analytics. SendGrid is a solid choice for teams that need a well-documented, widely adopted email provider with generous free-tier sending limits.

## Integration Architecture

Ory Kratos uses its built-in Courier to send transactional emails. On Ory Network, the Courier connects to SendGrid's SMTP relay to deliver identity-related emails.

```
User Action (e.g., registration)
        │
        ▼
   Ory Kratos
        │
        ▼
  Courier (SMTP client)
        │
        ▼
  SendGrid SMTP Relay
        │
        ▼
  Recipient Inbox
```

## Prerequisites

1. **SendGrid account** — Sign up at [sendgrid.com](https://sendgrid.com). A free tier allows up to 100 emails/day.
2. **API key** — Create an API key in Settings > API Keys with at least "Mail Send" permissions. This API key is used as the SMTP password.
3. **Sender identity** — Verify a sender identity (single sender or domain authentication). Domain authentication (which sets up SPF and DKIM) is strongly recommended.
4. **Domain authentication** — In Settings > Sender Authentication, complete domain authentication by adding the required CNAME records to your DNS.

## Configuration

### Ory Network SMTP Connection String

**Connection string format:**

```
smtps://apikey:{API_KEY}@smtp.sendgrid.net:465
```

Or using STARTTLS on port 587:

```
smtp://apikey:{API_KEY}@smtp.sendgrid.net:587
```

> **Important:** The SMTP username is literally the string `apikey` (not your actual API key name). The password is your SendGrid API key.

**Example:**

```
smtps://apikey:SG.xxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@smtp.sendgrid.net:465
```

**Using the Ory CLI:**

```bash
ory patch identity-config <project-id> \
  --replace '/courier/smtp/connection_uri="smtps://apikey:SG.your-api-key-here@smtp.sendgrid.net:465"' \
  --replace '/courier/smtp/from_address="noreply@yourdomain.com"' \
  --replace '/courier/smtp/from_name="Your App"'
```

> **Note:** If your API key contains special characters, URL-encode them.

## Technical Details

### SMTP Settings

| Setting        | Value                                  |
|----------------|----------------------------------------|
| Host           | `smtp.sendgrid.net`                    |
| Port (TLS)     | `465`                                  |
| Port (STARTTLS)| `587`                                  |
| Port (alt)     | `2525` (alternative if 587 is blocked) |
| Encryption     | TLS (port 465) or STARTTLS (port 587)  |
| Authentication | PLAIN or LOGIN                         |
| Username       | `apikey` (literal string)              |
| Password       | Your SendGrid API key                  |

### API Alternative

SendGrid provides a comprehensive REST API (v3) for sending email. Ory Network uses SMTP natively, so the API is not required for the standard integration. The API can be useful for:

- Retrieving email activity and statistics
- Managing suppressions and bounces
- Sending via the API with advanced features (categories, custom arguments, send-at scheduling)

**API endpoint:** `https://api.sendgrid.com/v3/mail/send`

## Email Template Customization

Email templates are managed in Ory Network. SendGrid receives fully rendered HTML and plain text via SMTP.

Customize templates via the Ory Console or CLI:

```bash
ory patch identity-config <project-id> \
  --replace '/courier/templates/verification/valid/email/body/html="<html><body>Your verification code: {{ .VerificationCode }}</body></html>"' \
  --replace '/courier/templates/verification/valid/email/subject="Confirm your email address"'
```

> **Note:** Do not use SendGrid's dynamic templates for Ory identity emails. Ory renders templates before sending, so SendGrid should receive the final content.

Refer to the [Ory email template documentation](https://www.ory.sh/docs/kratos/emails-sms/custom-email-templates) for template variables and syntax.

## Deliverability Considerations

1. **Domain authentication** — Complete SendGrid's domain authentication (Sender Authentication) to enable SPF and DKIM. This is the single most important step for deliverability.
2. **SPF** — Domain authentication adds an SPF-aligned CNAME record.
3. **DKIM** — Domain authentication adds DKIM-aligned CNAME records.
4. **DMARC** — Configure a DMARC DNS record for your domain.
5. **Link branding** — Set up link branding in SendGrid to replace default tracking links with your domain, improving trust signals.
6. **Dedicated IP** — Available on Pro plan and above. Recommended for senders exceeding 100,000 emails/month.
7. **Suppression management** — SendGrid automatically manages bounces, spam reports, and unsubscribes. Ory's transactional emails are not subject to unsubscribe requirements, but bounces and spam reports are still tracked.
8. **IP warmup** — If using a dedicated IP, enable SendGrid's automatic IP warmup feature.

## Testing

1. **Free tier** — Use the free tier (100 emails/day) for development and testing.
2. **Email Activity Feed** — The SendGrid dashboard provides an activity feed showing the status of every email (processed, delivered, opened, bounced, etc.).
3. **Ory self-service flows** — Trigger registration, verification, or recovery flows and verify delivery in the SendGrid activity feed.
4. **Event Webhook** — Set up SendGrid's Event Webhook to receive real-time delivery notifications for debugging.

## Resources

- [Ory Docs — SendGrid SMTP Configuration](https://www.ory.sh/docs/kratos/emails-sms/sending-emails-smtp#sendgrid)
- [Ory Docs — Sending Emails via SMTP](https://www.ory.sh/docs/kratos/emails-sms/sending-emails-smtp)
- [Ory Docs — Custom Email Templates](https://www.ory.sh/docs/kratos/emails-sms/custom-email-templates)
- [SendGrid Documentation](https://docs.sendgrid.com/)
- [SendGrid SMTP Integration Guide](https://docs.sendgrid.com/for-developers/sending-email/integrating-with-the-smtp-api)
- [SendGrid API Reference](https://docs.sendgrid.com/api-reference/mail-send/mail-send)
