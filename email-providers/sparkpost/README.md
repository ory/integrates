# SparkPost

> **Maintained by:** Community contributors

SparkPost (a Bird/MessageBird company) is an enterprise-grade transactional email platform with strong delivery analytics and deliverability tooling — a fit for high-volume identity emails with stringent deliverability requirements.

**Type:** config (Kratos courier-spi over SMTP or HTTP — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/email-providers/sparkpost](https://www.ory.com/docs/integrates-with/email-providers/sparkpost) — full guide: [ory.com/docs/kratos/emails-sms/sending-emails-smtp#sparkpost](https://www.ory.com/docs/kratos/emails-sms/sending-emails-smtp#sparkpost)

## How it works

Ory Kratos uses the **courier-spi** mechanism to dispatch emails. SMTP relay is the simplest path; the REST API is available if you need richer per-message metadata.

```
Ory Kratos courier → SparkPost SMTP (smtp.sparkpostmail.com:587) → recipient
```

## Prerequisites

1. **Ory Network account.**
2. **SparkPost account** at [sparkpost.com](https://www.sparkpost.com/) (US) or [eu.sparkpost.com](https://eu.sparkpost.com/) (EU).
3. **Verified sending domain** in SparkPost with DKIM and SPF set up.
4. **API key** with the **Send via SMTP** permission, generated under **Account → API Keys**.

## Configuration

### SMTP relay (recommended)

```bash
ory patch identity-config \
  --project <your-project-id> \
  --workspace <your-workspace-id> \
  --replace '/courier/smtp/connection_uri="smtp://SMTP_Injection:<sparkpost-api-key>@smtp.sparkpostmail.com:587/"' \
  --replace '/courier/smtp/from_address="no-reply@your-verified-domain.com"' \
  --replace '/courier/smtp/from_name="Your App"'
```

The literal username `SMTP_Injection` is correct — SparkPost uses it as the SMTP login for all customers. The password is your API key.

SparkPost uses STARTTLS on port `587`, so the scheme is `smtp://`. `smtps://` on port `587` fails the TLS handshake.

For the EU stack, replace the host with `smtp.eu.sparkpostmail.com`.

### REST API (alternative)

The REST API goes through Kratos's HTTP email courier (`courier.delivery_strategy: http`). `courier.channels` only accepts the `sms` channel, so email over HTTP is configured under `courier.http`:

```bash
ory patch identity-config \
  --project <your-project-id> \
  --workspace <your-workspace-id> \
  --replace '/courier/delivery_strategy="http"' \
  --replace '/courier/http/request_config={
    "url": "https://api.sparkpost.com/api/v1/transmissions",
    "method": "POST",
    "headers": {
      "Content-Type": "application/json"
    },
    "auth": {
      "type": "api_key",
      "config": { "name": "Authorization", "value": "<sparkpost-api-key>", "in": "header" }
    },
    "body": "base64://'"$(base64 < sparkpost-body.jsonnet | tr -d '\n')"'"
  }'
```

`sparkpost-body.jsonnet`:

```jsonnet
function(ctx) {
  recipients: [{ address: { email: ctx.recipient } }],
  content: {
    from: { email: 'no-reply@your-verified-domain.com', name: 'Your App' },
    subject: ctx.subject,
    text: ctx.body,
  } + (
    if std.objectHas(ctx, 'html_body') && ctx.html_body != ''
    then { html: ctx.html_body }
    else {}
  ),
}
```

The courier passes the rendered plaintext body as `ctx.body` and the rendered HTML body, when the template has one, as `ctx.html_body`. See the [`ctx` reference](https://www.ory.com/docs/kratos/emails-sms/sending-emails-smtp#payload).

For the EU stack, replace the API base with `https://api.eu.sparkpost.com`.

## Technical details

| Field | Value |
|---|---|
| SMTP host (US) | `smtp.sparkpostmail.com` |
| SMTP host (EU) | `smtp.eu.sparkpostmail.com` |
| SMTP port | `587` (STARTTLS) |
| SMTP login | literal string `SMTP_Injection` |
| SMTP password | your SparkPost API key |
| REST API base (US) | `https://api.sparkpost.com/api/v1` |
| REST API base (EU) | `https://api.eu.sparkpost.com/api/v1` |
| Transmissions endpoint | `POST /api/v1/transmissions` |

## Notes

- SparkPost separates US and EU accounts — pick the data residency before integration; account migrations are not trivial.
- The Transmissions API supports stored templates; if you want SparkPost-side template management instead of Kratos templates, configure the courier body to reference a template ID and pass substitution data only.
- SparkPost provides webhook events (delivery, bounce, opens, clicks) — useful to feed into your CDP if you want to close the loop on identity-flow email engagement.

## Resources

- [SparkPost SMTP setup](https://developers.sparkpost.com/api/smtp/)
- [SparkPost Transmissions API](https://developers.sparkpost.com/api/transmissions/)
- [Ory courier docs](https://www.ory.com/docs/kratos/emails-sms/sending-emails-smtp)
