# Plivo — SMS Provider Integration for Ory Network

## Overview

Plivo is a cloud communications platform offering SMS and voice APIs with a focus on reliability and cost-effectiveness. Plivo provides competitive per-message pricing, direct carrier connections in over 190 countries, and a straightforward REST API. It is a strong alternative for organizations seeking lower SMS costs without sacrificing delivery quality.

## Integration Architecture

Ory Kratos uses its Courier component to send SMS messages via an HTTP webhook. On Ory Network, the Courier sends an HTTP request to Plivo's Message API, with a Jsonnet template transforming the Ory message payload into Plivo's expected format.

```
User Action (e.g., MFA code request)
        │
        ▼
   Ory Kratos
        │
        ▼
  Courier (SMS webhook)
        │
        ▼
  Plivo Message API
    POST /Account/{AUTH_ID}/Message/
        │
        ▼
  Carrier Network → User's Phone
```

## Prerequisites

1. **Plivo account** — Sign up at [plivo.com](https://www.plivo.com). A free trial account includes test credits.
2. **Auth ID and Auth Token** — Found on the Plivo Console dashboard.
3. **Plivo phone number** — Purchase an SMS-enabled phone number from the Plivo console. This is your source (`src`) number.
4. **Powerpack** (optional) — For production use, consider a Plivo Powerpack, which provides number pooling, intelligent routing, and compliance features.

## Configuration

### Ory Network SMS Courier Webhook

Configure the SMS courier in Ory Network to send requests to Plivo's Message API.

**Ory identity config (YAML):**

```yaml
courier:
  sms:
    enabled: true
    request_config:
      url: https://api.plivo.com/v1/Account/<AUTH_ID>/Message/
      method: POST
      headers:
        Content-Type: application/json
      auth:
        type: basic_auth
        config:
          user: "<AUTH_ID>"
          password: "<AUTH_TOKEN>"
      body: file:///etc/config/courier/sms.jsonnet
```

**Using the Ory CLI:**

```bash
ory patch identity-config <project-id> \
  --replace '/courier/sms/enabled=true' \
  --replace '/courier/sms/request_config/url="https://api.plivo.com/v1/Account/MAXXXXXXXXXXXXXXXXXX/Message/"' \
  --replace '/courier/sms/request_config/method="POST"' \
  --replace '/courier/sms/request_config/headers/Content-Type="application/json"' \
  --replace '/courier/sms/request_config/auth/type="basic_auth"' \
  --replace '/courier/sms/request_config/auth/config/user="MAXXXXXXXXXXXXXXXXXX"' \
  --replace '/courier/sms/request_config/auth/config/password="your_auth_token"'
```

## Technical Details

### API Endpoint

| Setting         | Value                                                       |
|-----------------|-------------------------------------------------------------|
| URL             | `https://api.plivo.com/v1/Account/{AUTH_ID}/Message/`       |
| Method          | `POST`                                                      |
| Content-Type    | `application/json`                                          |
| Authentication  | HTTP Basic Auth (Auth ID : Auth Token)                      |

### Request Format

Plivo's Message API expects a JSON body:

```json
{
  "src": "+14155551234",
  "dst": "+1234567890",
  "text": "Your verification code is: 123456"
}
```

| Field  | Description                                           |
|--------|-------------------------------------------------------|
| `src`  | Source phone number (your Plivo number, E.164 format) |
| `dst`  | Destination phone number (E.164 format)               |
| `text` | The SMS message text                                  |

### Response Format

Plivo returns a JSON response:

```json
{
  "message": "message(s) queued",
  "message_uuid": ["db3ce55a-7f1d-11e1-8ea7-1231380bc196"],
  "api_id": "97ceeb52-58b6-11e1-86da-77300b68f8bb"
}
```

HTTP status `202` indicates the message was accepted for delivery.

## Jsonnet Template

The Jsonnet template transforms the Ory Courier message payload into the format expected by Plivo's API.

**`sms.jsonnet`:**

```jsonnet
function(ctx) {
  body: std.manifestJsonEx({
    src: "+1XXXXXXXXXX",
    dst: ctx.recipient,
    text: ctx.body,
  }, "  "),
}
```

> **Important:** Replace `+1XXXXXXXXXX` with your actual Plivo phone number in E.164 format.

**Using a Powerpack:**

```jsonnet
function(ctx) {
  body: std.manifestJsonEx({
    powerpack_uuid: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    dst: ctx.recipient,
    text: ctx.body,
  }, "  "),
}
```

When using a Powerpack, omit the `src` field and provide the `powerpack_uuid` instead. Plivo will automatically select the best number from the pool.

### Setting the Jsonnet Template via Ory CLI

```bash
ory patch identity-config <project-id> \
  --replace '/courier/sms/request_config/body="base64://<base64-encoded-jsonnet>"'
```

Encode your Jsonnet template to base64 and insert it into the command above.

## Phone Number Format Considerations

1. **E.164 format** — Plivo expects phone numbers in E.164 format with the `+` prefix: `+14155551234`. Both `src` and `dst` should use this format.
2. **Ory identity schema** — Store phone numbers in E.164 format in your Ory identity schema. Plivo accepts E.164 directly, so no format conversion is typically needed in the Jsonnet template.
3. **Multiple destinations** — Plivo supports sending to multiple recipients by separating numbers with `<` in the `dst` field (e.g., `+14155551234<+14155551235`). This is not needed for Ory identity flows, which send to one recipient at a time.
4. **Country-specific regulations** — Some countries require pre-registered sender IDs or local numbers. Check Plivo's [country-specific documentation](https://www.plivo.com/sms/coverage/) for requirements.

## Testing

1. **Plivo trial account** — Trial accounts can send SMS to verified phone numbers (added in the sandbox). Messages include a "Sent via Plivo Trial" prefix.
2. **Plivo Console logs** — View message logs in the Plivo Console under Messaging > Logs.
3. **Ory self-service flows** — Trigger a phone verification or MFA flow in your application and confirm delivery in the Plivo logs.
4. **Message status callbacks** — Add a `url` field to the Jsonnet body to receive delivery status updates:
   ```jsonnet
   // Add to the Jsonnet body:
   url: "https://your-webhook-endpoint.com/delivery-status",
   ```
5. **API debugging** — Plivo returns descriptive error messages in the API response. Common errors include:
   - `401` — Invalid Auth ID or Auth Token
   - `400` — Invalid phone number format or missing required fields
   - `404` — Incorrect Auth ID in the URL

## Resources

- [Ory Docs — Sending SMS Messages](https://www.ory.sh/docs/kratos/emails-sms/sending-sms)
- [Ory Docs — SMS Courier Configuration](https://www.ory.sh/docs/kratos/self-service/flows/verify-email-account-activation#phone-verification)
- [Plivo SMS API Documentation](https://www.plivo.com/docs/sms/)
- [Plivo Message API Reference](https://www.plivo.com/docs/sms/api/message/)
- [Plivo SMS Coverage](https://www.plivo.com/sms/coverage/)
- [Plivo Console](https://console.plivo.com/)
