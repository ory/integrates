# Google reCAPTCHA

> **Maintained by:** Community contributors

[Google reCAPTCHA](https://developers.google.com/recaptcha) is a bot-protection service. **v2** issues a visible (or invisible) challenge and returns a pass/fail token; **v3** runs entirely in the background and returns a score from `0.0` (bot) to `1.0` (human). Ory Network natively integrates Cloudflare Turnstile but not reCAPTCHA, so this integration adds reCAPTCHA via a sync pre-flow Action webhook that validates the client-side token against Google's `siteverify` API and either lets the flow proceed or interrupts it with a user-facing message.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrates-with/fraud-bot-protection/recaptcha](https://www.ory.com/docs/integrates-with/fraud-bot-protection/recaptcha)

## Use case

A consumer-facing product wants to stop bot signups and credential-stuffing attempts without enrolling in Cloudflare Turnstile. The team already has Google reCAPTCHA on its marketing site and wants the same protection on Ory-hosted registration and login flows. This integration runs as a sync webhook on the `after` trigger that interrupts the flow before any identity is created or session is issued if the reCAPTCHA token is missing, invalid, or scores below the configured threshold.

## How it works

1. The client loads `recaptcha/api.js`, generates a token (`grecaptcha.execute` for v3, or via the widget callback for v2), and submits it on the flow request via `transient_payload.recaptcha_token`.
2. On submission, Ory fires the sync Action webhook to this handler. The handler verifies the shared secret.
3. The handler POSTs `{secret, response, remoteip}` to Google's `https://www.google.com/recaptcha/api/siteverify` (form-urlencoded).
4. For v2: pass if `success: true`. For v3: pass if `success: true` AND `score >= RECAPTCHA_SCORE_THRESHOLD` AND (when set) `action == RECAPTCHA_EXPECTED_ACTION`.
5. Pass returns `200` with an empty body (flow continues). Fail returns `400` with `{messages:[{message:"…", type:"error"}]}` which Ory renders as a flow-level error message. Verify outages fail **closed** — a Google-API outage rejects the flow rather than silently letting bots through.

## Prerequisites

- A Google reCAPTCHA admin account ([www.google.com/recaptcha/admin](https://www.google.com/recaptcha/admin)) with a site key and secret key for v2 or v3.
- An Ory Network project with a custom registration/login UI that can attach `transient_payload`.
- A deployment target for the webhook handler (any Node.js runtime: Cloud Run, Heroku, Vercel, Lambda behind API Gateway, your own VM).

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill in ORY_WEBHOOK_SECRET, RECAPTCHA_SECRET_KEY, and (for v3) tune the threshold.
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /recaptcha/verify` — Ory Action target.

## Configure Ory

1. In the Ory Console, configure the Action hooks using the snippets in [`ory-actions.yaml`](ory-actions.yaml), on the `after` trigger for registration and login. Ory runs `before` actions when it creates the flow, so a `before` handler never receives `transient_payload` and cannot see the token.
2. The body template is [`jsonnet/verify.jsonnet`](jsonnet/verify.jsonnet).
3. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value declared in the hook config.
4. In your custom UI, load `recaptcha/api.js`, generate a token, and include it in `transient_payload.recaptcha_token` on the flow submission. A working browser snippet is in the [docs page](https://ory.com/docs/integrates-with/fraud-bot-protection/recaptcha).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match `X-Webhook-Secret` in the Ory hook config.
- **Every flow shows "Please complete the CAPTCHA verification"** — either the hooks are configured on the `before` trigger instead of `after`, or the client isn't attaching `transient_payload.recaptcha_token`. Confirm the token reaches the handler by adding a temporary `console.log(req.body.flow?.transient_payload)` line.
- **Every v3 flow shows "CAPTCHA verification failed"** with score-related logs — `RECAPTCHA_SCORE_THRESHOLD` is too aggressive for your traffic. Start at `0.3` while tuning.
- **`invalid-input-secret` in handler logs** — `RECAPTCHA_SECRET_KEY` is wrong, or you're using a v2 secret with v3 (and vice versa).
- **`timeout-or-duplicate` errors** — tokens are single-use and short-lived (~2 minutes). A retry that reuses the token will always fail.

## License

Apache-2.0. SPDX header at the top of each source file.
