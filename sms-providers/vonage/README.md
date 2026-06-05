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
| Auth | API key + secret in the **request body** (not headers) |
| Body | JSON with `api_key`, `api_secret`, `from`, `to`, `text` |

> Vonage's REST SMS API authenticates via credentials in the body, so the Kratos courier `auth` block stays empty — credentials live in the Jsonnet template instead.

## Setup

1. Sign up at [vonage.com](https://www.vonage.com); copy the **API key** and **API secret** from the dashboard.
2. Pick a sender — a Vonage virtual number, or an alphanumeric ID (up to 11 chars; not allowed in US/Canada).
3. Configure the SMS courier following the [Ory docs page](https://www.ory.com/docs/kratos/emails-sms/sending-sms) using the values in the table above.

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

Vonage accepts E.164 with or without the leading `+`; if delivery fails on a country, strip the `+` in the Jsonnet template.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
