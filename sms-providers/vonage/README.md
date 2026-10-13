# Vonage (Nexmo)

> **Maintained by:** Community contributors

Vonage (formerly Nexmo) is a global cloud-communications platform with strong EMEA/APAC carrier coverage — a common alternative to Twilio for products with significant international user bases.

**Type:** config (Kratos courier-spi over HTTP — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/sms-providers/vonage](https://www.ory.com/docs/integrates-with/sms-providers/vonage) — full guide: [ory.com/docs/kratos/emails-sms/sending-sms#vonage-nexmo](https://www.ory.com/docs/kratos/emails-sms/sending-sms#vonage-nexmo)

The Ory docs page covers the SMS courier configuration in general. Vonage-specific values:

| Setting | Value |
| --- | --- |
| URL | `https://rest.nexmo.com/sms/json` |
| Method | `POST` |
| Content-Type | `application/x-www-form-urlencoded` |
| Auth | HTTP Basic (`API key` : `API secret`) |
| Body | Form fields `from`, `to` (no leading `+`), `text` |

> Use the courier's `basic_auth` block with the API key as `user` and the API secret as `password`, both as plain strings. This keeps the credentials out of the Jsonnet template.

## Setup

1. Sign up at [vonage.com](https://www.vonage.com); copy the **API key** and **API secret** from the dashboard.
2. Pick a sender — a Vonage virtual number, or an alphanumeric ID (up to 11 chars; not allowed in US/Canada).
3. Configure the SMS courier following the [Ory docs page](https://www.ory.com/docs/kratos/emails-sms/sending-sms) using the values in the table above. With `application/x-www-form-urlencoded`, the courier turns the object the template returns into form fields, so every value must be a string. Encode the template and set it as `body: base64://<base64-encoded-jsonnet>`.

```jsonnet
function(ctx) {
  from: 'YourApp',
  to:
    if std.startsWith(ctx.recipient, '+')
    then std.substr(ctx.recipient, 1, std.length(ctx.recipient) - 1)
    else ctx.recipient,
  text: ctx.body,
}
```

Vonage expects the recipient in E.164 format without the leading `+`, so the template strips it.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
