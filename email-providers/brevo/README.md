# Brevo (formerly Sendinblue)

> **Maintained by:** Community contributors

Brevo (formerly Sendinblue) is a European email and marketing platform with strong GDPR posture. Wire it up as an Ory Network email courier when you want EU-hosted infrastructure or need Brevo-side analytics on identity-driven email.

**Type:** config (Kratos courier-spi over SMTP or HTTP — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/email-providers/brevo](https://www.ory.com/docs/integrates-with/email-providers/brevo) — full guide: [ory.com/docs/kratos/emails-sms/sending-emails-smtp#brevo](https://www.ory.com/docs/kratos/emails-sms/sending-emails-smtp#brevo)

## How it works

Ory Kratos uses the **courier-spi** mechanism to dispatch emails. You point Kratos at Brevo's SMTP relay (recommended for most customers) and Kratos handles the verification / recovery / MFA email body, From, Subject, and templating.

```
Ory Kratos courier → Brevo SMTP relay (smtp-relay.brevo.com:587) → recipient
```

## Prerequisites

1. **Ory Network account.**
2. **Brevo account** at [brevo.com](https://www.brevo.com/).
3. A **verified sender domain** in Brevo (DKIM + Return-Path). Unauthenticated senders will be filtered or rejected by major providers.
4. An **SMTP key** generated from **Brevo → SMTP & API → SMTP** — note the SMTP login and the SMTP key shown on that page. URI-encode both in the connection URI (for example, `@` becomes `%40`).

## Configuration

### SMTP relay (recommended)

In the Ory Console under **Email & SMS → Email** or via CLI:

```bash
ory patch identity-config \
  --project <your-project-id> \
  --workspace <your-workspace-id> \
  --replace '/courier/smtp/connection_uri="smtp://<brevo-smtp-login>:<brevo-smtp-key>@smtp-relay.brevo.com:587/"' \
  --replace '/courier/smtp/from_address="no-reply@your-verified-domain.com"' \
  --replace '/courier/smtp/from_name="Your App"'
```

Use `smtp://` with port `587` (STARTTLS) or `smtps://` with port `465` (implicit TLS). `smtps://` on port `587` fails the TLS handshake.

### REST API (alternative)

If you need Brevo-side analytics that the SMTP relay does not surface, you can post to Brevo's REST API instead via Kratos's HTTP email courier (`courier.delivery_strategy: http`). `courier.channels` only accepts the `sms` channel, so email over HTTP is configured under `courier.http`:

```bash
ory patch identity-config \
  --project <your-project-id> \
  --workspace <your-workspace-id> \
  --replace '/courier/delivery_strategy="http"' \
  --replace '/courier/http/request_config={
    "url": "https://api.brevo.com/v3/smtp/email",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "auth": {
      "type": "api_key",
      "config": { "name": "api-key", "value": "<brevo-api-key>", "in": "header" }
    },
    "body": "base64://'"$(base64 < brevo-body.jsonnet | tr -d '\n')"'"
  }'
```

`brevo-body.jsonnet`:

```jsonnet
function(ctx) {
  sender: { email: 'no-reply@your-verified-domain.com', name: 'Your App' },
  to: [{ email: ctx.recipient }],
  subject: ctx.subject,
  textContent: ctx.body,
} + (
  if std.objectHas(ctx, 'html_body') && ctx.html_body != ''
  then { htmlContent: ctx.html_body }
  else {}
)
```

The courier passes the rendered plaintext body as `ctx.body` and the rendered HTML body, when the template has one, as `ctx.html_body`. See the [`ctx` reference](https://www.ory.com/docs/kratos/emails-sms/sending-emails-smtp#payload).

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
