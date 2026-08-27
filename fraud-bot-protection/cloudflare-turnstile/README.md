# Cloudflare Turnstile

> **Maintained by:** Community contributors

[Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) is a non-interactive CAPTCHA alternative — invisible challenge using browser signals, ML, and proof-of-work, no visual puzzle in most cases. Free, privacy-preserving, and good UX.

**Type:** webhook (Ory Action verifies the Turnstile token from the client) — code in customer's webhook handler
**Docs page:** [ory.com/docs/integrates-with/fraud-bot-protection/cloudflare-turnstile](https://www.ory.com/docs/integrates-with/fraud-bot-protection/cloudflare-turnstile)

## How it works

1. Your registration / login UI embeds the **Turnstile client widget**; the widget runs the challenge invisibly and returns a token (`cf-turnstile-response`).
2. The form submits to Ory's flow with the token in `transient_payload.turnstile_token`.
3. An Ory Action on `registration.after` / `login.after` (with `can_interrupt: true`) calls your handler.
4. The handler POSTs to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with the token + Turnstile **secret key**; checks `success == true`.
5. On fail, the handler returns an error and the Ory flow blocks the user.

> Note: these are `after` hooks, not `before` hooks. Ory Kratos Identities runs `before` actions when it creates the flow, so
> their payload carries no `transient_payload` and the handler never sees the token. The `after` login hook still runs before it
> issues a session, and the `after` registration hook before it persists the identity, so `can_interrupt: true` still blocks.

## Setup outline

1. In Cloudflare dashboard → **Turnstile**, create a site; copy the **Site Key** (public, client widget) and **Secret Key** (server verify).
2. Embed the Turnstile widget in your registration/login UI; configure it to render `data-callback` setting the token on form submit.
3. Configure an Ory Action on `registration.after` / `login.after` with `can_interrupt: true` pointing at your handler.
4. Handler calls Turnstile `siteverify` and surfaces a failure to Ory (HTTP 4xx with a Kratos-style messages array).

## Notable

- Turnstile is **free** with no per-call limit — practical default for new projects.
- Tokens are **one-time use** and expire ~5 minutes after issue.
- Optional `remoteip` field on siteverify enables Turnstile's IP-binding check; pass the client IP through your reverse proxy.

## Status

Community / proposed — no dedicated Ory documentation. Same pattern as hCaptcha / reCAPTCHA / Arkose.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
