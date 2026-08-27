# hCaptcha

> **Maintained by:** Community contributors

[hCaptcha](https://www.hcaptcha.com) is a privacy-focused CAPTCHA service — drop-in alternative to reCAPTCHA with stronger privacy posture (no data sale, GDPR-compliant) and a paid Enterprise tier with adaptive challenge difficulty.

**Type:** webhook (Ory Action verifies the hCaptcha token from the client) — code in customer's webhook handler
**Docs page:** [ory.com/docs/integrates-with/fraud-bot-protection/hcaptcha](https://www.ory.com/docs/integrates-with/fraud-bot-protection/hcaptcha)

## How it works

1. Your registration / login UI embeds the **hCaptcha client widget**; the widget runs the challenge and returns a token (`h-captcha-response`).
2. The form submits to Ory's flow with the token in `transient_payload.hcaptcha_token`.
3. An Ory Action on `registration.after` / `login.after` (with `can_interrupt: true`) calls your handler.
4. The handler POSTs to `https://hcaptcha.com/siteverify` with the token + hCaptcha **secret**; checks `success == true`.
5. On fail, the handler returns an error and the Ory flow blocks the user.

> Note: these are `after` hooks, not `before` hooks. Ory runs `before` actions when it creates the flow, so their payload
> carries no `transient_payload` and the handler never sees the token. The `after` login hook still runs before Ory issues a
> session, and the `after` registration hook before Ory persists the identity, so `can_interrupt: true` still blocks.

## Setup outline

1. Sign up at [hcaptcha.com](https://www.hcaptcha.com); create a site; copy the **Site Key** (public, client widget) and **Secret** (server verify).
2. Embed the hCaptcha widget in your registration/login UI.
3. Configure an Ory Action on `registration.after` / `login.after` with `can_interrupt: true` pointing at your handler.
4. Handler calls hCaptcha `siteverify` and surfaces a failure to Ory.

## Notable

- hCaptcha tokens are **one-time use** and expire 2 minutes after issue.
- Optional `remoteip` field in siteverify; pass the client IP through your reverse proxy.
- hCaptcha API contract is nearly identical to reCAPTCHA — easy to swap if you start with one and migrate to the other.
- Enterprise tier supports adaptive risk scoring + invisible challenges; the verify endpoint shape is the same.

## Status

Community / proposed — no dedicated Ory documentation. Same pattern as Turnstile / reCAPTCHA / Arkose.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
