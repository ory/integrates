# MessageBird (Bird) — SMS Provider Integration for Ory Network

## Overview

MessageBird (now rebranded as Bird) is a European-headquartered cloud communications platform providing SMS, voice, and messaging APIs. It offers strong coverage across Europe, Asia-Pacific, and globally, with a focus on reliability and regulatory compliance. MessageBird is a compelling choice for organizations with European user bases or those looking for an alternative to US-based providers.

## Integration Architecture

Ory Kratos uses its Courier component to send SMS messages via an HTTP webhook. On Ory Network, the Courier sends an HTTP request to MessageBird's Messages API, with a Jsonnet template transforming the Ory message payload into MessageBird's expected format.

```
User Action (e.g., phone verification)
        │
        ▼
   Ory Kratos
        │
        ▼
  Courier (SMS webhook)
        │
        ▼
  MessageBird Messages API
    POST /messages
        │
        ▼
  Carrier Network → User's Phone
```

## Prerequisites

1. **MessageBird account** — Sign up at [messagebird.com](https://www.messagebird.com) (or [bird.com](https://www.bird.com)). A free trial includes test credits.
2. **API key** — Generate a live API key in the MessageBird Dashboard under Developer > API access.
3. **Originator** — This is your sender identity. It can be:
   - A purchased MessageBird virtual number
   - An alphanumeric sender ID (up to 11 characters, supported in most countries)

## Configuration

### Ory Network SMS Courier Webhook

Configure the SMS courier in Ory Network to send requests to MessageBird's API.

**Ory identity config (YAML):**

```yaml
courier:
  sms:
    enabled: true
    request_config:
      url: https://rest.messagebird.com/messages
      method: POST
      headers:
        Content-Type: application/json
        Authorization: "AccessKey YOUR_API_KEY"
      body: file:///etc/config/courier/sms.jsonnet
```

**Using the Ory CLI:**

```bash
ory patch identity-config <project-id> \
  --replace '/courier/sms/enabled=true' \
  --replace '/courier/sms/request_config/url="https://rest.messagebird.com/messages"' \
  --replace '/courier/sms/request_config/method="POST"' \
  --replace '/courier/sms/request_config/headers/Content-Type="application/json"' \
  --replace '/courier/sms/request_config/headers/Authorization="AccessKey YOUR_API_KEY"'
```

## Technical Details

### API Endpoint

| Setting         | Value                                    |
|-----------------|------------------------------------------|
| URL             | `https://rest.messagebird.com/messages`  |
| Method          | `POST`                                   |
| Content-Type    | `application/json`                       |
| Authentication  | `Authorization: AccessKey <API_KEY>`     |

### Request Format

MessageBird's Messages API expects a JSON body:

```json
{
  "originator": "YourApp",
  "recipients": [
    "1234567890"
  ],
  "body": "Your verification code is: 123456"
}
```

| Field         | Description                                           |
|---------------|-------------------------------------------------------|
| `originator`  | Sender identity (phone number or alphanumeric string) |
| `recipients`  | Array of recipient phone numbers (MSISDN format)      |
| `body`        | The SMS message text (max 1600 characters, auto-concatenated) |

### Response Format

MessageBird returns a JSON response:

```json
{
  "id": "e8077d803532c0b5937c639b60216938",
  "href": "https://rest.messagebird.com/messages/e8077d803532c0b5937c639b60216938",
  "direction": "mt",
  "type": "sms",
  "originator": "YourApp",
  "body": "Your verification code is: 123456",
  "recipients": {
    "totalCount": 1,
    "totalSentCount": 1,
    "totalDeliveredCount": 0,
    "items": [
      {
        "recipient": 1234567890,
        "status": "sent",
        "statusDatetime": "2024-01-15T10:30:00+00:00"
      }
    ]
  }
}
```

HTTP status `201` indicates the message was created successfully.

## Jsonnet Template

The Jsonnet template transforms the Ory Courier message payload into the format expected by MessageBird's API.

**`sms.jsonnet`:**

```jsonnet
function(ctx) {
  body: std.manifestJsonEx({
    originator: "YourApp",
    recipients: [
      // Strip the "+" prefix if present, MessageBird expects MSISDN format
      if std.startsWith(ctx.recipient, "+")
      then std.substr(ctx.recipient, 1, std.length(ctx.recipient) - 1)
      else ctx.recipient,
    ],
    body: ctx.body,
  }, "  "),
}
```

> **Important:** Replace `"YourApp"` with your actual sender identity (alphanumeric string or phone number).

**Using a virtual number as originator:**

```jsonnet
function(ctx) {
  body: std.manifestJsonEx({
    originator: "31612345678",
    recipients: [
      if std.startsWith(ctx.recipient, "+")
      then std.substr(ctx.recipient, 1, std.length(ctx.recipient) - 1)
      else ctx.recipient,
    ],
    body: ctx.body,
  }, "  "),
}
```

### Setting the Jsonnet Template via Ory CLI

```bash
ory patch identity-config <project-id> \
  --replace '/courier/sms/request_config/body="base64://<base64-encoded-jsonnet>"'
```

Encode your Jsonnet template to base64 and insert it into the command above.

## Phone Number Format Considerations

1. **MSISDN format** — MessageBird expects phone numbers in MSISDN format (international format without the `+` prefix): `1234567890` for US, `447700900000` for UK. The Jsonnet template above handles stripping the `+`.
2. **Alphanumeric originator** — Supported in most countries (up to 11 characters). Not supported in the US, Canada, or China where a registered number is required.
3. **Ory identity schema** — Store phone numbers in E.164 format (`+1234567890`) in your Ory identity schema and strip the `+` in the Jsonnet template.
4. **Number lookup** — MessageBird offers a Number Lookup API to validate phone numbers before sending. This can reduce failed deliveries.

## Testing

1. **MessageBird test API key** — MessageBird provides test API keys that simulate sending without actually delivering messages or incurring charges.
2. **Dashboard logs** — View message logs in the MessageBird Dashboard under Messages > SMS.
3. **Ory self-service flows** — Trigger a phone verification or MFA flow in your application and check the MessageBird logs for delivery status.
4. **Status reports** — MessageBird provides delivery status callbacks. Configure a status report URL in the API request to receive real-time delivery updates:
   ```jsonnet
   // Add to the Jsonnet body:
   reportUrl: "https://your-webhook-endpoint.com/delivery-status",
   ```
5. **Error codes** — MessageBird returns detailed error codes for failed messages. Refer to the [error reference](https://developers.messagebird.com/api/#errors) for troubleshooting.

## Resources

- [Ory Docs — Sending SMS Messages](https://www.ory.sh/docs/kratos/emails-sms/sending-sms)
- [Ory Docs — SMS Courier Configuration](https://www.ory.sh/docs/kratos/self-service/flows/verify-email-account-activation#phone-verification)
- [MessageBird SMS API Documentation](https://developers.messagebird.com/api/sms-messaging/)
- [MessageBird API Reference](https://developers.messagebird.com/api/)
- [MessageBird Dashboard](https://dashboard.messagebird.com/)
- [Bird (MessageBird) Documentation](https://docs.bird.com/)
