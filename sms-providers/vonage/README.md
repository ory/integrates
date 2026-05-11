# Vonage (Nexmo) — SMS Provider Integration for Ory Network

## Overview

Vonage (formerly Nexmo) is a global cloud communications platform providing SMS, voice, and messaging APIs. Vonage has particularly strong coverage in EMEA and APAC regions and is known for reliable message delivery and competitive international pricing. It is a solid alternative to Twilio for organizations with significant international user bases.

## Integration Architecture

Ory Kratos uses its Courier component to send SMS messages via an HTTP webhook. On Ory Network, the Courier sends an HTTP request to Vonage's SMS API, with a Jsonnet template transforming the Ory message payload into Vonage's expected format.

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
  Vonage SMS API
    POST /sms/json
        │
        ▼
  Carrier Network → User's Phone
```

## Prerequisites

1. **Vonage account** — Sign up at [vonage.com](https://www.vonage.com) or [dashboard.nexmo.com](https://dashboard.nexmo.com). A free trial balance is provided for testing.
2. **API key and API secret** — Found on the Vonage Dashboard home page.
3. **Virtual number** — Purchase a Vonage virtual number with SMS capability, or use an alphanumeric sender ID (supported in many countries).
4. **Application** (optional) — For advanced use cases, create a Vonage Application in the dashboard.

## Configuration

### Ory Network SMS Courier Webhook

Configure the SMS courier in Ory Network to send requests to Vonage's SMS API.

**Ory identity config (YAML):**

```yaml
courier:
  sms:
    enabled: true
    request_config:
      url: https://rest.nexmo.com/sms/json
      method: POST
      headers:
        Content-Type: application/json
      body: file:///etc/config/courier/sms.jsonnet
```

> **Note:** Vonage's SMS API uses API key/secret in the request body for authentication (not HTTP headers), so no `auth` block is needed in the webhook config. The credentials are included in the Jsonnet template.

**Using the Ory CLI:**

```bash
ory patch identity-config <project-id> \
  --replace '/courier/sms/enabled=true' \
  --replace '/courier/sms/request_config/url="https://rest.nexmo.com/sms/json"' \
  --replace '/courier/sms/request_config/method="POST"' \
  --replace '/courier/sms/request_config/headers/Content-Type="application/json"'
```

## Technical Details

### API Endpoint

| Setting         | Value                               |
|-----------------|-------------------------------------|
| URL             | `https://rest.nexmo.com/sms/json`   |
| Method          | `POST`                              |
| Content-Type    | `application/json`                  |
| Authentication  | API key + secret in request body    |

### Request Format

Vonage's SMS API expects a JSON body:

```json
{
  "api_key": "your_api_key",
  "api_secret": "your_api_secret",
  "from": "YourApp",
  "to": "1234567890",
  "text": "Your verification code is: 123456"
}
```

### Response Format

Vonage returns a JSON response:

```json
{
  "message-count": "1",
  "messages": [
    {
      "to": "1234567890",
      "message-id": "0A00000012345678",
      "status": "0",
      "remaining-balance": "10.00",
      "message-price": "0.03",
      "network": "23410"
    }
  ]
}
```

A `status` of `"0"` indicates the message was accepted. Any other value indicates an error.

## Jsonnet Template

The Jsonnet template transforms the Ory Courier message payload into the format expected by Vonage's SMS API.

**`sms.jsonnet`:**

```jsonnet
function(ctx) {
  body: std.manifestJsonEx({
    api_key: "YOUR_API_KEY",
    api_secret: "YOUR_API_SECRET",
    from: "YourApp",
    to: ctx.recipient,
    text: ctx.body,
  }, "  "),
}
```

> **Important:** Replace `YOUR_API_KEY`, `YOUR_API_SECRET`, and `YourApp` with your actual Vonage credentials and sender identity.

**Using a virtual number as sender:**

```jsonnet
function(ctx) {
  body: std.manifestJsonEx({
    api_key: "YOUR_API_KEY",
    api_secret: "YOUR_API_SECRET",
    from: "447700900000",
    to: ctx.recipient,
    text: ctx.body,
  }, "  "),
}
```

### Using the Vonage Messages API v1 (Alternative)

Vonage also offers a newer Messages API (v1) that uses JWT authentication and supports multiple channels. For SMS-only use, the REST SMS API above is simpler. If you prefer the Messages API:

**URL:** `https://api.nexmo.com/v1/messages`

```jsonnet
function(ctx) {
  body: std.manifestJsonEx({
    message_type: "text",
    channel: "sms",
    from: "YourApp",
    to: ctx.recipient,
    text: ctx.body,
  }, "  "),
}
```

This would require JWT or API key/secret authentication in the webhook `auth` config.

### Setting the Jsonnet Template via Ory CLI

```bash
ory patch identity-config <project-id> \
  --replace '/courier/sms/request_config/body="base64://<base64-encoded-jsonnet>"'
```

Encode your Jsonnet template to base64 and insert it into the command above.

## Phone Number Format Considerations

1. **E.164 format** — Vonage accepts phone numbers in E.164 format (without the `+` prefix): `1234567890` for US, `447700900000` for UK. Some implementations also accept the `+` prefix.
2. **Alphanumeric sender IDs** — Vonage supports alphanumeric sender IDs (up to 11 characters) in many countries. This allows you to send from a brand name like "MyApp" instead of a phone number. Note that recipients cannot reply to alphanumeric senders.
3. **Country restrictions** — Some countries (notably the US and Canada) do not support alphanumeric sender IDs and require a registered phone number.
4. **Number format in Ory** — Ensure your Ory identity schema stores phone numbers in E.164 format. You may need to strip the `+` prefix in the Jsonnet template if Vonage rejects it:
   ```jsonnet
   to: if std.startsWith(ctx.recipient, "+") then std.substr(ctx.recipient, 1, std.length(ctx.recipient) - 1) else ctx.recipient,
   ```

## Testing

1. **Vonage trial account** — Trial accounts include a test balance. Messages can be sent to any number (no verification required), but a "Sent from Vonage trial" prefix is added.
2. **Vonage Dashboard logs** — View message logs in the Vonage Dashboard under Logs > SMS.
3. **Ory self-service flows** — Trigger a phone verification or MFA flow in your application and confirm delivery in the Vonage logs.
4. **Test numbers** — Vonage provides a set of test numbers for simulating various delivery scenarios. Check the [testing documentation](https://developer.vonage.com/en/messaging/sms/guides/testing).
5. **Delivery receipts** — Vonage supports delivery receipts (DLRs) via webhook. You can configure a DLR webhook URL in the Vonage Dashboard to track message delivery status.

## Resources

- [Ory Docs — Sending SMS Messages](https://www.ory.sh/docs/kratos/emails-sms/sending-sms)
- [Ory Docs — SMS Courier Configuration](https://www.ory.sh/docs/kratos/self-service/flows/verify-email-account-activation#phone-verification)
- [Vonage SMS API Documentation](https://developer.vonage.com/en/messaging/sms/overview)
- [Vonage SMS API Reference](https://developer.vonage.com/api/sms)
- [Vonage Messages API](https://developer.vonage.com/en/messages/overview)
- [Vonage Dashboard](https://dashboard.nexmo.com/)
