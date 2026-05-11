# Mailchimp Transactional (Mandrill) — Email Provider Integration for Ory Network

## Overview

Mailchimp Transactional (formerly Mandrill) is the transactional email service built into the Mailchimp platform. It is designed for automated, triggered emails such as verification codes, password resets, and notifications. Mailchimp Transactional is a natural choice for organizations already using Mailchimp for marketing, as it shares the same account, billing, and sender reputation infrastructure.

## Integration Architecture

Ory Kratos uses its built-in Courier to send transactional emails. On Ory Network, the Courier connects to Mailchimp Transactional's SMTP endpoint to deliver identity-related emails.

```
User Action (e.g., password reset)
        │
        ▼
   Ory Kratos
        │
        ▼
  Courier (SMTP client)
        │
        ▼
  Mailchimp Transactional (Mandrill) SMTP
        │
        ▼
  Recipient Inbox
```

## Prerequisites

1. **Mailchimp account with Transactional add-on** — Mailchimp Transactional is a paid add-on to Mailchimp. Enable it from your Mailchimp account under Transactional Email (or directly at [mandrillapp.com](https://mandrillapp.com)).
2. **API key** — Generate an API key in the Mailchimp Transactional dashboard (Settings > SMTP & API Info). This key serves as both the API key and the SMTP password.
3. **Verified sending domain** — Add and verify your sending domain in Mailchimp Transactional. This requires adding SPF and DKIM DNS records.
4. **Active sending** — Mailchimp Transactional may require a paid Mailchimp plan and an active transactional email block purchase.

## Configuration

### Ory Network SMTP Connection String

**Connection string format:**

```
smtps://any_username:{API_KEY}@smtp.mandrillapp.com:465
```

Or using STARTTLS on port 587:

```
smtp://any_username:{API_KEY}@smtp.mandrillapp.com:587
```

> **Note:** The SMTP username can be any string (Mandrill ignores it for authentication), but it must be present. A common convention is to use your Mailchimp account email or the literal string `apikey`.

**Example:**

```
smtps://apikey:md-xxxxxxxxxxxxxxxxxxxx@smtp.mandrillapp.com:465
```

**Using the Ory CLI:**

```bash
ory patch identity-config <project-id> \
  --replace '/courier/smtp/connection_uri="smtps://apikey:md-your-api-key@smtp.mandrillapp.com:465"' \
  --replace '/courier/smtp/from_address="noreply@yourdomain.com"' \
  --replace '/courier/smtp/from_name="Your App"'
```

### Sender Address

The `from_address` must use a domain that has been verified in your Mailchimp Transactional account.

## Technical Details

### SMTP Settings

| Setting        | Value                                      |
|----------------|--------------------------------------------|
| Host           | `smtp.mandrillapp.com`                     |
| Port (TLS)     | `465`                                      |
| Port (STARTTLS)| `587`                                      |
| Port (alt)     | `2525` (alternative if 587 is blocked)     |
| Encryption     | TLS (port 465) or STARTTLS (port 587)      |
| Authentication | PLAIN or LOGIN                             |
| Username       | Any string (e.g., `apikey`)                |
| Password       | Mailchimp Transactional API key            |

### API Alternative

Mailchimp Transactional provides a REST API for sending email and managing account settings. Ory Network uses SMTP natively, so the API is not required for the standard integration. The API is useful for:

- Querying message status and delivery history
- Managing rejection lists and allowlists
- Accessing detailed sending statistics
- Using Mandrill templates (separate from Ory templates)

**API endpoint:** `https://mandrillapp.com/api/1.0/`

## Email Template Customization

Email templates are managed in Ory Network. Mailchimp Transactional receives fully rendered HTML and plain text via SMTP and delivers them as-is.

Customize templates in Ory:

```bash
ory patch identity-config <project-id> \
  --replace '/courier/templates/recovery/valid/email/body/html="<html><body>Reset your password: {{ .RecoveryURL }}</body></html>"' \
  --replace '/courier/templates/recovery/valid/email/subject="Password Reset Request"'
```

> **Note:** Do not use Mandrill's server-side templates for Ory identity emails. Ory renders its own templates before handing the message to SMTP.

Refer to the [Ory email template documentation](https://www.ory.sh/docs/kratos/emails-sms/custom-email-templates) for full details.

## Deliverability Considerations

1. **Domain verification** — Verify your sending domain in Mailchimp Transactional by adding the required SPF and DKIM DNS records. This is mandatory for production sending.
2. **SPF** — Add Mailchimp Transactional's SPF record (`include:spf.mandrillapp.com`) to your domain's SPF configuration.
3. **DKIM** — Add the DKIM TXT record provided by Mailchimp Transactional during domain verification.
4. **DMARC** — Configure a DMARC record for your domain to improve deliverability and prevent domain spoofing.
5. **Custom Return-Path** — Configure a custom return-path domain in Mailchimp Transactional for full DMARC alignment.
6. **Dedicated IP** — Available on higher-volume plans. Provides independent sender reputation.
7. **Reputation monitoring** — Mailchimp Transactional provides a sender reputation score (1-100) in the dashboard. Monitor this to catch issues early.
8. **Automatic suppression** — Hard bounces and spam complaints are automatically suppressed, protecting your reputation.

## Testing

1. **Test mode** — Mailchimp Transactional supports a test API key mode. Messages sent with a test key are accepted and logged but not delivered.
2. **Outbound activity** — The Mailchimp Transactional dashboard shows detailed outbound activity including delivery status, opens, clicks, and bounces.
3. **Ory self-service flows** — Trigger registration, verification, or recovery flows in your application and verify delivery in the Mandrill outbound log.
4. **Search and filtering** — Use the Mandrill activity search to filter by recipient, subject, or status for debugging.

## Resources

- [Ory Docs — Sending Emails via SMTP](https://www.ory.sh/docs/kratos/emails-sms/sending-emails-smtp)
- [Ory Docs — Custom Email Templates](https://www.ory.sh/docs/kratos/emails-sms/custom-email-templates)
- [Mailchimp Transactional Documentation](https://mailchimp.com/developer/transactional/)
- [Mandrill SMTP Integration](https://mailchimp.com/developer/transactional/docs/smtp-integration/)
- [Mandrill API Reference](https://mailchimp.com/developer/transactional/api/)
- [Mailchimp Transactional Getting Started](https://mailchimp.com/developer/transactional/guides/send-first-email/)
