# Plivo

> **Maintained by:** Community contributors

Plivo is a cloud-communications platform with direct carrier connections in 190+ countries — a common pick when SMS unit economics matter. Mentioned alongside Twilio in the Ory SMS docs as a supported HTTP courier target.

**Type:** config (Kratos courier-spi over HTTP — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/sms-providers/plivo](https://www.ory.com/docs/integrates-with/sms-providers/plivo) — full guide: [ory.com/docs/kratos/emails-sms/sending-sms#plivo](https://www.ory.com/docs/kratos/emails-sms/sending-sms#plivo)

The Ory docs page covers the SMS courier configuration in general. Plivo-specific values:

| Setting | Value |
| --- | --- |
| URL | `https://api.plivo.com/v1/Account/<AUTH_ID>/Message/` |
| Method | `POST` |
| Auth | HTTP Basic (`Auth ID` : `Auth Token`) |
| Body | JSON with `src` (E.164), `dst` (E.164), `text` |

## Setup

1. Sign up at [plivo.com](https://www.plivo.com); grab the **Auth ID** and **Auth Token** from the console.
2. Buy an SMS-enabled phone number — this is your `src`.
3. Configure the SMS courier following the [Ory docs page](https://www.ory.com/docs/kratos/emails-sms/sending-sms) using the values in the table above. Plivo accepts E.164 directly (no `+` stripping needed).

```jsonnet
function(ctx) {
  body: std.manifestJsonEx({
    src: "+1XXXXXXXXXX",
    dst: ctx.recipient,
    text: ctx.body,
  }, "  "),
}
```

For production, consider a Plivo **Powerpack** (number pool with intelligent routing) — replace `src` with `powerpack_uuid`.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
