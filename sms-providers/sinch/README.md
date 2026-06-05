# Sinch

> **Maintained by:** Community contributors

Sinch is an enterprise communications platform with global carrier coverage and verification-specific features. Wire it up as an Ory Network HTTP SMS courier for OTPs and verification codes.

**Type:** config (Kratos courier-spi over HTTP — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/sms-providers/sinch](https://www.ory.com/docs/integrates-with/sms-providers/sinch) — full guide: [ory.com/docs/kratos/emails-sms/sending-sms#sinch](https://www.ory.com/docs/kratos/emails-sms/sending-sms#sinch)

## How it works

Ory Kratos's SMS courier posts each outbound message to a configured HTTP endpoint. We point that endpoint at the Sinch SMS API and translate Kratos's payload into a Sinch batch request.

```
Ory Kratos SMS courier
  POST {your-courier-url}
        body: { recipient, body, message_type }
            ↓
       Sinch SMS API
       POST https://{region}.sms.api.sinch.com/xms/v1/{service-plan-id}/batches
            ↓
       Carrier delivery
```

## Prerequisites

1. **Ory Network account.**
2. **Sinch account** at [sinch.com](https://www.sinch.com/) with an active **service plan**.
3. The **service plan ID** and an **API token** with `sms:write` access (Customer Dashboard → SMS → APIs).
4. A **registered sender** (long code, short code, or alphanumeric depending on country regulations).

## Configuration

Configure the Kratos SMS courier to call Sinch directly:

```bash
ory patch identity-config \
  --project <your-project-id> \
  --workspace <your-workspace-id> \
  --replace '/courier/channels=[{
    "id": "sms",
    "type": "http",
    "request_config": {
      "url": "https://us.sms.api.sinch.com/xms/v1/<service-plan-id>/batches",
      "method": "POST",
      "headers": {
        "authorization": "Bearer <sinch-api-token>",
        "content-type": "application/json"
      },
      "body": "base64://'"$(base64 < sinch-body.jsonnet)"'"
    }
  }]'
```

`sinch-body.jsonnet`:

```jsonnet
function(ctx) {
  from: '<your-registered-sender>',
  to: [ctx.recipient],
  body: ctx.body,
}
```

For the EU stack, change the host to `eu.sms.api.sinch.com`.

## Technical details

| Field | Value |
|---|---|
| API host (US) | `us.sms.api.sinch.com` |
| API host (EU) | `eu.sms.api.sinch.com` |
| Send batch endpoint | `POST /xms/v1/{service-plan-id}/batches` |
| Auth | `Authorization: Bearer <api-token>` |
| Content type | `application/json` |

## Notes

- Sinch enforces sender registration per country. Some destinations require a long code or pre-approved alphanumeric ID; using the wrong sender for a region will silently degrade delivery.
- For verification flows specifically, Sinch also offers a higher-level **Verification API** that handles OTP generation and validation in-house. The integration above uses the lower-level SMS API so Kratos's existing OTP logic remains the source of truth.
- Sinch returns batch IDs; if you need delivery status, configure a Sinch delivery report webhook back to your own service. Kratos does not consume delivery reports directly.

## Resources

- [Sinch SMS API reference](https://developers.sinch.com/docs/sms/api-reference/)
- [Sinch sender registration overview](https://developers.sinch.com/docs/sms/getting-started/regulatory-information/)
- [Ory SMS courier docs](https://www.ory.com/docs/kratos/emails-sms/sending-sms)
