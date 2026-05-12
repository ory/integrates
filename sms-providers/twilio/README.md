# Twilio

> **Maintained by:** Community contributors

Twilio Programmable SMS is the most widely deployed cloud SMS platform — extensive carrier coverage, well-documented REST API, and the **canonical example used in the Ory SMS docs**.

**Type:** config (Kratos courier-spi over HTTP — no webhook code)
**Docs page:** [ory.com/docs/kratos/emails-sms/sending-sms](https://www.ory.com/docs/kratos/emails-sms/sending-sms)

The Ory docs page walks through the SMS courier configuration end-to-end using Twilio as the example. Twilio-specific values:

| Setting | Value |
| --- | --- |
| URL | `https://api.twilio.com/2010-04-01/Accounts/<ACCOUNT_SID>/Messages.json` |
| Method | `POST` |
| Content-Type | `application/x-www-form-urlencoded` (required — Twilio rejects JSON) |
| Auth | HTTP Basic (`Account SID` : `Auth Token`) |
| Body | URL-encoded `To`, `From`, `Body` |

## Setup

1. Sign up at [twilio.com](https://www.twilio.com); copy the **Account SID** and **Auth Token** from the console.
2. Buy an SMS-enabled Twilio phone number — this is your `From`.
3. Configure the SMS courier following the [Ory docs page](https://www.ory.com/docs/kratos/emails-sms/sending-sms) (the example uses Twilio directly).

```jsonnet
function(ctx) {
  body: "To=" + std.encodeURI(ctx.recipient)
      + "&From=" + std.encodeURI("+1XXXXXXXXXX")
      + "&Body=" + std.encodeURI(ctx.body),
}
```

For production, consider a Twilio **Messaging Service** (sender pool, country-specific routing, compliance) — replace the `From=...` parameter with `MessagingServiceSid=MGxxxx...`.

## Notes

- **Trial accounts** can only send to verified numbers. Add test numbers in the Twilio console.
- Twilio offers **Test Credentials** (separate SID/Token) that simulate sending without delivery or charges — useful for CI.
- E.164 (`+CC...`) is required for both `To` and `From`.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
