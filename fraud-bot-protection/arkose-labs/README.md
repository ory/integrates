# Arkose Labs

> **Maintained by:** Community contributors

[Arkose Labs](https://www.arkoselabs.com) is a bot detection and fraud-prevention platform — adaptive enforcement challenges that progress from invisible risk scoring to interactive puzzles only when warranted. Designed for high-value flows (account creation, login, payment).

**Type:** webhook (Ory Action verifies the Arkose token from the client) — code lives in customer's webhook handler
**Docs page:** [ory.com/docs/integrates-with/fraud-bot-protection/arkose-labs](https://www.ory.com/docs/integrates-with/fraud-bot-protection/arkose-labs)

## How it works

1. Your registration / login UI embeds the **Arkose Labs client SDK**; the SDK runs scoring + a challenge if needed and returns a one-time token.
2. The form submits to Ory's flow with the token in a custom field (or trait — but custom field is cleaner).
3. An Ory Action on `registration.before` / `login.before` (with `can_interrupt: true`) calls your handler.
4. The handler POSTs to Arkose `https://customer-api.arkoselabs.com/api/v4/verify/` with the token + private key; checks `solved == true`.
5. On fail, the handler returns an error and the Ory flow blocks the user.

## Setup outline

1. Sign up at Arkose Labs; create a **Public Key** (client SDK) and **Private Key** (verify API).
2. Add the Arkose client SDK to your registration/login UI; configure it to set the token on form submit.
3. Configure an Ory Action on `registration.before` / `login.before` with `can_interrupt: true` pointing at your handler.
4. The handler calls Arkose's verify endpoint and surfaces a failure to Ory (returning HTTP 4xx with a Kratos-style messages array).

## Notable

- Arkose tokens are **one-time use** — if your handler retries verify with the same token, it'll get a `not_valid` error.
- Use a **per-flow** token (don't reuse across registration and login).
- Arkose offers granular per-game enforcement — pick the right challenge type per flow risk profile.

## Status

Community / proposed — no dedicated Ory documentation. Pattern is universal (similar shape to recaptcha / hcaptcha / turnstile entries).

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
