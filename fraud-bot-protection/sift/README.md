# Sift

> **Maintained by:** Community contributors

[Sift](https://sift.com) is a digital trust & safety platform — real-time fraud detection and account-abuse prevention via ML scoring of user events. Returns an abuse score per event so you can decide allow / review / block.

**Type:** webhook (Ory Action posts events + reads scores) — code in customer's webhook handler
**Docs page:** [ory.com/docs/integrates-with/fraud-bot-protection/sift](https://www.ory.com/docs/integrates-with/fraud-bot-protection/sift)

## How it works

Two flows in one handler:

**Pre-flow check (block on fail)**
1. Ory Action on `registration.before` / `login.before` with `can_interrupt: true` calls handler.
2. Handler reads the user's current Sift abuse score (`GET /v205/users/{user_id}/score`).
3. If the score exceeds a configurable threshold, handler returns a failure and Ory blocks the flow.

**Post-event reporting (signal collection)**
1. Ory Action on `registration.after` / `login.after` (async, `response.ignore: true`) calls handler.
2. Handler POSTs a `$create_account` / `$login` event to `https://api.sift.com/v205/events` with the user's data (IP, user agent, session, traits).
3. Sift updates its internal model and the user's score for future pre-flow checks.

Both flows must run for Sift to be useful — pre-flow alone has no signal; post-event alone never blocks.

## Setup outline

1. Sign up at Sift; copy the **API Key** (server-side, all calls).
2. Configure two Ory Actions — `before` (sync, can_interrupt) and `after` (async) — both pointing at your handler.
3. Handler implements both endpoints, reusing the Sift API key.

## Notable

- Sift uses **reserved event names** (`$create_account`, `$login`, `$transaction`, etc.) prefixed with `$`; user IDs should be stable across sessions.
- Threshold tuning is a calibration exercise — start permissive (block on score > 80) and tighten as you collect data.
- Sift's value is the **longitudinal model** — single events have limited signal; the integration's payoff grows over time as Sift learns the user base.

## Status

Community / proposed — no dedicated Ory documentation.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
