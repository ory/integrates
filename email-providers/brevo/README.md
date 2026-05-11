# Brevo (formerly Sendinblue) — Ory Network Integration

> **Maintained by:** Ory Engineering

## Overview

Brevo (formerly Sendinblue) is a European email and marketing platform with strong GDPR posture. Brevo exposes both an SMTP relay and a REST v3 API for transactional email, and can be wired up as an Ory Network courier for verification, recovery, and MFA email delivery. Brevo is a good fit for customers that want EU-hosted email infrastructure or need Brevo-side analytics on identity-driven email.

## How it works

Ory Kratos uses the **courier-spi** mechanism to dispatch emails. You point Kratos at Brevo's SMTP relay (recommended for most customers) and Kratos handles the verification / recovery / MFA email body, From, Subject, and templating.

```
Ory Kratos courier → Brevo SMTP relay (smtp-relay.brevo.com:587) → recipient
```

## Prerequisites

1. **Ory Network account.**
2. **Brevo account** at [brevo.com](https://www.brevo.com/).
3. A **verified sender domain** in Brevo (DKIM + Return-Path). Unauthenticated senders will be filtered or rejected by major providers.
4. An **SMTP key** generated from **Brevo → SMTP & API → SMTP** — note the SMTP login (your Brevo account email) and the SMTP key.

## Configuration

### SMTP relay (recommended)

In the Ory Console under **Email & SMS → Email** or via CLI:

```bash
ory patch identity-config \
  --project <your-project-id> \
  --workspace <your-workspace-id> \
  --replace '/courier/smtp/connection_uri="smtps://<brevo-smtp-login>:<brevo-smtp-key>@smtp-relay.brevo.com:587"' \
  --replace '/courier/smtp/from_address="no-reply@your-verified-domain.com"' \
  --replace '/courier/smtp/from_name="Your App"'
```

### REST API (alternative)

If you need Brevo-side analytics that the SMTP relay does not surface, you can post to Brevo's REST API instead via Kratos's HTTP courier:

```bash
ory patch identity-config \
  --project <your-project-id> \
  --workspace <your-workspace-id> \
  --replace '/courier/channels=[{
    "id": "email",
    "type": "http",
    "request_config": {
      "url": "https://api.brevo.com/v3/smtp/email",
      "method": "POST",
      "headers": {
        "api-key": "<brevo-api-key>",
        "content-type": "application/json"
      },
      "body": "base64://'"$(base64 < brevo-body.jsonnet)"'"
    }
  }]'
```

`brevo-body.jsonnet`:

```jsonnet
function(ctx) {
  sender: { email: 'no-reply@your-verified-domain.com', name: 'Your App' },
  to: [{ email: ctx.recipient }],
  subject: ctx.subject,
  htmlContent: ctx.body.html,
  textContent: ctx.body.plaintext,
}
```

## Technical details

| Field | Value |
|---|---|
| SMTP host | `smtp-relay.brevo.com` |
| SMTP port (STARTTLS) | `587` |
| SMTP port (TLS) | `465` |
| REST API base | `https://api.brevo.com/v3` |
| Transactional endpoint | `POST /v3/smtp/email` |
| Auth header | `api-key: <brevo-api-key>` |

## Notes

- Brevo's free tier rate-limits SMTP. Identity flows that send recovery or verification emails at scale should be on a paid plan.
- DKIM and Return-Path must be aligned with the From domain or major providers (Gmail, Microsoft) will degrade deliverability.
- Brevo SMTP keys are distinct from API keys — do not confuse them.

## Resources

- [Brevo SMTP setup](https://help.brevo.com/hc/en-us/articles/209462765)
- [Brevo Transactional Email API](https://developers.brevo.com/reference/sendtransacemail)
- [Ory courier docs](https://www.ory.com/docs/kratos/emails-sms/sending-emails-smtp)
