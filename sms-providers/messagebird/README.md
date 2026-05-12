# MessageBird (Bird)

> **Maintained by:** Community contributors

MessageBird (rebranded as Bird) is a European cloud-communications platform — strong coverage in EU/APAC and a common alternative to US-based SMS providers for products with EU regulatory or residency concerns.

**Type:** config (Kratos courier-spi over HTTP — no webhook code)
**Docs page:** [ory.com/docs/kratos/emails-sms/sending-sms](https://www.ory.com/docs/kratos/emails-sms/sending-sms)

The Ory docs page covers the SMS courier configuration in general. MessageBird-specific values:

| Setting | Value |
| --- | --- |
| URL | `https://rest.messagebird.com/messages` |
| Method | `POST` |
| Auth | header `Authorization: AccessKey <API_KEY>` |
| Body | JSON with `originator`, `recipients[]` (MSISDN, no `+` prefix), `body` |

## Setup

1. Sign up at [messagebird.com](https://www.messagebird.com); generate a live API key under **Developer → API access**.
2. Pick an **originator** — a MessageBird virtual number, or an alphanumeric sender ID (up to 11 chars; not supported in US/Canada/China).
3. Configure the SMS courier following the [Ory docs page](https://www.ory.com/docs/kratos/emails-sms/sending-sms) using the values in the table above. The Jsonnet body strips the leading `+` from Ory's E.164 recipient before passing it to MessageBird (which expects MSISDN format).

```jsonnet
function(ctx) {
  body: std.manifestJsonEx({
    originator: "YourApp",
    recipients: [
      if std.startsWith(ctx.recipient, "+")
      then std.substr(ctx.recipient, 1, std.length(ctx.recipient) - 1)
      else ctx.recipient,
    ],
    body: ctx.body,
  }, "  "),
}
```

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
