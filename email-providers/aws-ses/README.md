# Amazon SES — Email Provider Integration for Ory Network

## Overview

Amazon Simple Email Service (SES) is a cloud-based email sending service from AWS designed for transactional and marketing email. It offers high deliverability, pay-per-use pricing, and deep integration with the AWS ecosystem. SES is a strong choice for organizations already running infrastructure on AWS.

## Integration Architecture

Ory Kratos uses a built-in Courier component to send transactional emails (verification, recovery, MFA codes, etc.). On Ory Network (managed cloud), the Courier connects to Amazon SES over SMTP to deliver messages.

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
  Amazon SES SMTP Endpoint
        │
        ▼
  Recipient Inbox
```

Ory Kratos sends email via the SES SMTP interface using IAM-derived SMTP credentials. SES handles delivery, bounce processing, and complaint management.

## Prerequisites

1. **AWS Account** with Amazon SES enabled.
2. **SES out of sandbox** — By default, new SES accounts are in sandbox mode, which restricts sending to verified addresses only. Request production access through the AWS console.
3. **Verified domain or email address** — You must verify the domain or at least the sender address you intend to use in SES.
4. **SMTP credentials** — SES SMTP credentials are derived from IAM credentials but are NOT the same as your IAM access key. You must generate SMTP credentials from the SES console (SMTP Settings section). These produce a dedicated SMTP username and password.
5. **Region selection** — SES is region-specific. Note the SMTP endpoint for your chosen AWS region.

## Configuration

### Ory Network SMTP Connection String

Configure the SMTP connection in Ory Network using the Ory CLI or the Ory Console.

**Connection string format:**

```
smtps://{SMTP_USERNAME}:{SMTP_PASSWORD}@email-smtp.{REGION}.amazonaws.com:465
```

Or for STARTTLS on port 587:

```
smtp://{SMTP_USERNAME}:{SMTP_PASSWORD}@email-smtp.{REGION}.amazonaws.com:587
```

**Example:**

```
smtps://AKIAIOSFODNN7EXAMPLE:BFke2MwQOPjkly9Gk3%2Bpth1XyZ%2BmExample@email-smtp.us-east-1.amazonaws.com:465
```

> **Important:** URL-encode special characters in the SMTP password. Characters like `+`, `/`, and `=` commonly appear in SES SMTP passwords and must be percent-encoded (`%2B`, `%2F`, `%3D`).

**Using the Ory CLI:**

```bash
ory patch identity-config <project-id> \
  --replace '/courier/smtp/connection_uri="smtps://SMTP_USER:SMTP_PASS@email-smtp.us-east-1.amazonaws.com:465"' \
  --replace '/courier/smtp/from_address="noreply@yourdomain.com"' \
  --replace '/courier/smtp/from_name="Your App"'
```

### Sender Address

The `from_address` must be a verified identity (domain or email) in SES. If your domain `yourdomain.com` is verified, any address `*@yourdomain.com` can be used.

## Technical Details

### SMTP Settings

| Setting        | Value                                          |
|----------------|------------------------------------------------|
| Host           | `email-smtp.{REGION}.amazonaws.com`            |
| Port (TLS)     | `465`                                          |
| Port (STARTTLS)| `587`                                          |
| Encryption     | TLS (port 465) or STARTTLS (port 587)          |
| Authentication | PLAIN (SMTP username + password from SES)      |
| Username       | SES SMTP username (generated in SES console)   |
| Password       | SES SMTP password (generated in SES console)   |

### Regional SMTP Endpoints

| Region              | Endpoint                                    |
|---------------------|---------------------------------------------|
| US East (N. Virginia) | `email-smtp.us-east-1.amazonaws.com`      |
| US West (Oregon)    | `email-smtp.us-west-2.amazonaws.com`        |
| EU (Ireland)        | `email-smtp.eu-west-1.amazonaws.com`        |
| EU (Frankfurt)      | `email-smtp.eu-central-1.amazonaws.com`     |
| Asia Pacific (Mumbai) | `email-smtp.ap-south-1.amazonaws.com`     |
| Asia Pacific (Sydney) | `email-smtp.ap-southeast-2.amazonaws.com` |

Check the [AWS documentation](https://docs.aws.amazon.com/ses/latest/dg/regions.html) for the full list of SES-supported regions.

### API Alternative

SES also provides a REST API (v2) for sending email. However, Ory Network's built-in Courier uses SMTP. If you need API-based sending, you would need to implement a custom Courier via webhooks, which is generally unnecessary since the SMTP integration works well.

## Email Template Customization

Ory Network allows customization of email templates for verification, recovery, and other identity flows. Templates are configured through the Ory Console or CLI and support Go `text/template` syntax.

You can customize:

- **Subject lines**
- **HTML body** and **plain text body**
- **Sender name and address**

Templates are managed in Ory, not in SES. SES acts purely as a transport layer.

```bash
ory patch identity-config <project-id> \
  --replace '/courier/templates/verification/valid/email/subject="Verify your email for MyApp"'
```

Refer to the [Ory email template documentation](https://www.ory.sh/docs/kratos/emails-sms/custom-email-templates) for full details.

## Deliverability Considerations

1. **SPF** — SES automatically handles SPF when you use its SMTP endpoints.
2. **DKIM** — Enable Easy DKIM in SES for your verified domain. SES will provide three CNAME records to add to your DNS.
3. **DMARC** — Configure a DMARC DNS record for your domain to improve deliverability and prevent spoofing.
4. **Bounce and complaint handling** — Configure SES to send bounce and complaint notifications to an SNS topic. High bounce rates can cause SES to pause your sending.
5. **Dedicated IP addresses** — For high-volume senders, consider dedicated IPs in SES to build independent sender reputation.
6. **Sending limits** — SES imposes per-second and per-day sending limits. Monitor these in the SES console and request increases as needed.

## Testing

1. **SES Sandbox testing** — While in sandbox mode, you can only send to verified email addresses. Use this to test the integration before requesting production access.
2. **SES Mailbox Simulator** — AWS provides simulator addresses for testing:
   - `success@simulator.amazonses.com` — Successful delivery
   - `bounce@simulator.amazonses.com` — Hard bounce
   - `complaint@simulator.amazonses.com` — Complaint
3. **Ory self-service flows** — Trigger a registration or recovery flow in your Ory-integrated application and verify the email arrives.
4. **CloudWatch metrics** — Monitor SES sending metrics (sends, deliveries, bounces, complaints) in AWS CloudWatch.

## Resources

- [Ory Docs — AWS SES SMTP Configuration](https://www.ory.sh/docs/kratos/emails-sms/sending-emails-smtp#aws-ses-smtp)
- [Ory Docs — Sending Emails via SMTP](https://www.ory.sh/docs/kratos/emails-sms/sending-emails-smtp)
- [Ory Docs — Custom Email Templates](https://www.ory.sh/docs/kratos/emails-sms/custom-email-templates)
- [AWS SES Developer Guide](https://docs.aws.amazon.com/ses/latest/dg/Welcome.html)
- [AWS SES SMTP Credentials](https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html)
- [AWS SES Regions and Endpoints](https://docs.aws.amazon.com/ses/latest/dg/regions.html)
