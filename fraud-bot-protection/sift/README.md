# Sift

> **Maintained by:** Community contributors

[Sift](https://sift.com) is a digital trust & safety platform — real-time fraud detection and account-abuse prevention via ML scoring of user events. Returns an abuse score per event so you can decide allow / review / block.

**Type:** webhook (Ory Action posts events + reads scores) — code in customer's webhook handler
**Docs page:** [ory.com/docs/integrates-with/fraud-bot-protection/sift](https://www.ory.com/docs/integrates-with/fraud-bot-protection/sift)

## How it works

Two flows in one handler:

**Check on sign-in (block on fail)**
1. Ory Action on `login.after` with `response.parse: true` calls handler.
2. Handler reads the user's current Sift abuse score (`GET /v205/users/{user_id}/score`), using the Ory identity ID as `user_id`.
3. If the score exceeds a configurable threshold, handler responds with a `4xx` status code (not `429`) and a `messages` body, and Ory blocks the sign-in.

**Post-event reporting (signal collection)**
1. Ory Actions on `registration.after` and `login.after` with `response.ignore: true` call handler. At registration, this action runs after the identity is saved, so it receives the real identity ID.
2. Handler POSTs a `$create_account` / `$login` event to `https://api.sift.com/v205/events` with the user's data (IP, user agent, session, traits).
3. Sift updates its internal model and the user's score for future checks.

Both flows must run for Sift to be useful: the score lookup alone has no signal, and the event reporter alone never blocks.

> Note: the blocking hook is an `after` hook. Ory Kratos Identities runs `before` actions when it creates the flow, before it
> has resolved an identity, so a `before` handler has no `user_id` to score. The `after` login hook runs before it issues a
> session, so a `4xx` response still blocks. A `registration.after` action with `response.parse: true` runs before the identity
> is saved and receives the ID `00000000-0000-0000-0000-000000000000`, so send `$create_account` from an action without
> `response.parse`.

## Setup outline

1. Sign up at Sift; copy the **API Key** (server-side, all calls).
2. Configure the Ory Actions in the method-specific hook lists, such as `selfservice.flows.login.after.password.hooks` and
   `selfservice.flows.registration.after.password.hooks`, and repeat them for every method you enable, such as `oidc` or `code`.
   Ory runs the global `after.hooks` list only for a method that has no hooks of its own. Keep the `session` hook last in the
   registration lists.
   - Score check: `login.after`, `response.parse: true`.
   - Event reporter: `registration.after` and `login.after`, `response.ignore: true`.
3. Handler implements both endpoints, reusing the Sift API key. Read the client IP from the `True-Client-Ip` request header and
   the user agent from `User-Agent`, null-safely, for example `std.get(ctx.request_headers, 'True-Client-Ip', [null])[0]`.
4. To block, respond with a `4xx` status code and this body. Ory shows the `text` to the user:

   ```json
   {
     "messages": [
       {
         "instance_ptr": "#/",
         "messages": [{ "id": 123, "text": "Sign-in blocked. Please contact support.", "type": "error" }]
       }
     ]
   }
   ```

   Ory waits about 30 seconds for the handler and retries a `5xx` response (three attempts in total).

## Notable

- Sift uses **reserved event names** (`$create_account`, `$login`, `$transaction`, etc.) prefixed with `$`; user IDs should be stable across sessions.
- The Score API returns scores between 0 and 1; the Sift Console shows them on a 0 to 100 scale. Threshold tuning is a calibration exercise — start permissive (block above `0.8`) and tighten as you collect data.
- Sift's value is the **longitudinal model** — single events have limited signal; the integration's payoff grows over time as Sift learns the user base.

## Status

Community / proposed — no dedicated Ory documentation.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
