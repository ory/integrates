# Twilio — SMS Provider Integration for Ory Network

## Overview

Twilio Programmable SMS is the leading cloud communications platform for sending and receiving text messages globally. It offers extensive carrier coverage, reliable delivery, and a well-documented REST API. Twilio is the primary SMS provider used with Ory Network for sending SMS-based verification codes, MFA one-time passwords, and other identity-related messages.

## Integration Architecture

Ory Kratos uses its Courier component to send SMS messages via an HTTP webhook. On Ory Network, the Courier dispatches SMS requests to an HTTP endpoint that forwards the message to Twilio's API.

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
  Twilio Messages API
    POST /2010-04-01/Accounts/{SID}/Messages.json
        │
        ▼
  Carrier Network → User's Phone
```

Ory Kratos sends the SMS payload via its courier webhook mechanism. A Jsonnet template transforms the Ory message format into Twilio's API format. The webhook sends the request directly to Twilio's REST API.

## Prerequisites

1. **Twilio account** — Sign up at [twilio.com](https://www.twilio.com). A free trial is available with a trial balance.
2. **Account SID and Auth Token** — Found on your Twilio Console dashboard.
3. **Twilio phone number** — Purchase a phone number with SMS capability from the Twilio console. This is your `from` number.
4. **Messaging Service SID** (optional) — For production, consider using a Twilio Messaging Service, which provides features like sender pool management, country-specific routing, and compliance handling.

## Configuration

### Ory Network SMS Courier Webhook

Configure the SMS courier in Ory Network to send requests to Twilio's API.

**Ory identity config (YAML):**

```yaml
courier:
  sms:
    enabled: true
    request_config:
      url: https://api.twilio.com/2010-04-01/Accounts/<ACCOUNT_SID>/Messages.json
      method: POST
      headers:
        Content-Type: application/x-www-form-urlencoded
      auth:
        type: basic_auth
        config:
          user: "<ACCOUNT_SID>"
          password: "<AUTH_TOKEN>"
      body: file:///etc/config/courier/sms.jsonnet
```

**Using the Ory CLI:**

```bash
ory patch identity-config <project-id> \
  --replace '/courier/sms/enabled=true' \
  --replace '/courier/sms/request_config/url="https://api.twilio.com/2010-04-01/Accounts/ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/Messages.json"' \
  --replace '/courier/sms/request_config/method="POST"' \
  --replace '/courier/sms/request_config/headers/Content-Type="application/x-www-form-urlencoded"' \
  --replace '/courier/sms/request_config/auth/type="basic_auth"' \
  --replace '/courier/sms/request_config/auth/config/user="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"' \
  --replace '/courier/sms/request_config/auth/config/password="your_auth_token"'
```

## Technical Details

### API Endpoint

| Setting         | Value                                                                   |
|-----------------|-------------------------------------------------------------------------|
| URL             | `https://api.twilio.com/2010-04-01/Accounts/{ACCOUNT_SID}/Messages.json` |
| Method          | `POST`                                                                  |
| Content-Type    | `application/x-www-form-urlencoded`                                     |
| Authentication  | HTTP Basic Auth (Account SID : Auth Token)                              |

### Request Format

Twilio's Messages API expects a `application/x-www-form-urlencoded` body with the following fields:

| Field   | Description                                      |
|---------|--------------------------------------------------|
| `To`    | Recipient phone number in E.164 format           |
| `From`  | Your Twilio phone number in E.164 format         |
| `Body`  | The SMS message text                             |

### Response Format

Twilio returns a JSON response with message details:

```json
{
  "sid": "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "status": "queued",
  "to": "+1234567890",
  "from": "+0987654321",
  "body": "Your verification code is: 123456"
}
```

HTTP status `201` indicates the message was accepted for delivery.

## Jsonnet Template

The Jsonnet template transforms the Ory Courier message payload into the format expected by Twilio's API.

**`sms.jsonnet`:**

```jsonnet
function(ctx) {
  // Twilio expects x-www-form-urlencoded body
  // Ory sends the body as a URL-encoded string when Content-Type is set
  body: "To=" + std.encodeURI(ctx.recipient) + "&From=" + std.encodeURI("+1XXXXXXXXXX") + "&Body=" + std.encodeURI(ctx.body),
}
```

> **Important:** Replace `+1XXXXXXXXXX` with your actual Twilio phone number in E.164 format.

**Alternative using Messaging Service SID:**

```jsonnet
function(ctx) {
  body: "To=" + std.encodeURI(ctx.recipient) + "&MessagingServiceSid=" + std.encodeURI("MGXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX") + "&Body=" + std.encodeURI(ctx.body),
}
```

### Ory Courier Context Variables

The `ctx` object provided to the Jsonnet template contains:

| Field          | Description                          |
|----------------|--------------------------------------|
| `ctx.recipient`| Recipient phone number               |
| `ctx.body`     | The SMS message text                 |

### Setting the Jsonnet Template via Ory CLI

You can set the Jsonnet body inline using base64 encoding:

```bash
ory patch identity-config <project-id> \
  --replace '/courier/sms/request_config/body="base64://ZnVuY3Rpb24oY3R4KSB7CiAgYm9keTogIlRvPSIgKyBzdGQuZW5jb2RlVVJJKGN0eC5yZWNpcGllbnQpICsgIiZGcm9tPSIgKyBzdGQuZW5jb2RlVVJJKCIrMVhYWFhYWFhYWFgiKSArICImQm9keT0iICsgc3RkLmVuY29kZVVSSShjdHguYm9keSksCn0="'
```

## Phone Number Format Considerations

1. **E.164 format required** — Twilio requires phone numbers in E.164 format: `+[country code][number]` (e.g., `+14155552671`).
2. **Ory phone number storage** — Ensure your Ory identity schema stores phone numbers in E.164 format. Use identity schema validation to enforce this.
3. **International sending** — Twilio supports sending to most countries. Some destinations require pre-registration or geo-permissions to be enabled in your Twilio console (Messaging > Settings > Geo Permissions).
4. **Alphanumeric sender IDs** — In some countries, you can use an alphanumeric sender ID (e.g., "MyApp") instead of a phone number. Configure this in the Jsonnet template by replacing the `From` field.

## Testing

1. **Twilio trial account** — Trial accounts can send SMS to verified phone numbers only. Add your test phone numbers in the Twilio console.
2. **Test credentials** — Twilio provides test credentials (Test Account SID and Test Auth Token) that simulate sending without actually delivering or charging. Use specific magic numbers for testing:
   - `+15005550006` — Valid `From` number
   - `+15005550001` — Invalid `From` number (triggers error)
3. **Ory self-service flows** — Trigger a phone verification or MFA flow in your Ory-integrated application.
4. **Twilio Message Logs** — View message logs in the Twilio console (Monitor > Logs > Messages) to debug delivery status.
5. **Webhook debugging** — Use Twilio's debugger or a tool like [webhook.site](https://webhook.site) to inspect the request payload before connecting to Twilio.

## Resources

- [Ory Docs — Sending SMS Messages](https://www.ory.sh/docs/kratos/emails-sms/sending-sms)
- [Ory Docs — SMS Courier Configuration](https://www.ory.sh/docs/kratos/self-service/flows/verify-email-account-activation#phone-verification)
- [Twilio Programmable SMS Documentation](https://www.twilio.com/docs/sms)
- [Twilio Messages API Reference](https://www.twilio.com/docs/sms/api/message-resource)
- [Twilio Test Credentials](https://www.twilio.com/docs/iam/test-credentials)
- [E.164 Phone Number Format](https://www.twilio.com/docs/glossary/what-e164)
