# Elastic SIEM

> **Maintained by:** Community contributors

[Elastic SIEM](https://www.elastic.co/security/siem) (part of the Elastic Stack) — security analytics, threat detection, incident response, built on Elasticsearch + Kibana. This integration ingests Ory Network identity and authentication events into Elasticsearch, mapping to the **Elastic Common Schema (ECS)** for standardized security monitoring.

**Type:** webhook (Ory Action → handler → Elastic bulk ingest API) — wiring is Ory Action config + customer-implemented handler
**Docs page:** [ory.com/docs/integrates-with/siem-security-analytics/elastic-siem](https://www.ory.com/docs/integrates-with/siem-security-analytics/elastic-siem)

## How it works

1. Ory fires Actions after registration, login, settings, recovery, and verification. Logins that complete a second factor arrive as login events; the session's `authentication_methods` show which factors were used.
2. Handler verifies the Ory webhook secret.
3. Handler transforms the event to an ECS document and POSTs to Elasticsearch's bulk API at `https://<elastic-host>/_bulk` (or via Fleet Server / Elastic Agent for an Elastic Cloud deployment). When the target is a data stream, such as `logs-ory-default`, use the `create` bulk action: data streams reject the `index` action.
4. Kibana / Elastic Security UI surfaces the events in dashboards, detection rules, and timelines.

## ECS mapping

| Ory event | ECS fields |
| --- | --- |
| Registration | `event.action: user-creation`, `event.category: ["authentication", "iam"]`, `event.outcome: success` |
| Login | `event.action: logon`, `event.category: ["authentication"]`, `event.outcome: success` |
| Recovery / verification | `event.action: password-reset` / `email-verification` |
| All events | `user.id` from `ctx.identity.id`, `user.email` from the email trait, `source.ip` from the `True-Client-Ip` request header, `user_agent.original` from the `User-Agent` request header |

Read headers null-safely in the body Jsonnet, for example `std.get(ctx.request_headers, 'True-Client-Ip', [null])[0]`. The Ory Action payload has no `X-Forwarded-For` header. ECS has no field for the authentication factor: put Ory-specific values, such as the methods in `ctx.session.authentication_methods` on login events, under a custom namespace like `ory.authentication_methods`.

These actions report completed flows. Collect failed sign-in attempts from a separate source, such as Ory Kratos Identities logs, before mapping them to `event.outcome: failure`.

## Setup outline

1. Create an Elasticsearch ingest user with `write` privileges on the target index pattern (typically `logs-ory-*`).
2. Build a webhook handler that maps Ory event payloads to ECS documents and bulk-ingests them.
3. Configure Ory Actions on each lifecycle hook (async, `response.ignore: true`) pointing at the handler. Put each action in the method-specific lists, such as `selfservice.flows.registration.after.password.hooks` and `selfservice.flows.login.after.password.hooks`, and repeat it for every method you enable, such as `oidc` or `code`. Ory Kratos Identities runs the flow-level `after.hooks` lists only for a method that has no hooks of its own, and on Ory Network the registration `password` list always contains `session`; keep `session` last. Recovery and verification have only flow-level lists, such as `selfservice.flows.verification.after.hooks`. See [Attach `after` actions to authentication methods](https://www.ory.com/docs/kratos/hooks/configure-hooks#attach-after-actions-to-authentication-methods).

## Notable

- Index Lifecycle Management (ILM): apply an ILM policy to the `logs-ory-*` index for retention + tier transitions (hot → warm → cold) per your compliance window.
- For Fleet-managed deployments, package the handler as a custom Elastic Integration and ship via the Fleet UI.
- Detection rules: pre-built rules in Elastic Security Detection Engine for common identity attacks (brute force, impossible travel, credential stuffing) can target ECS-mapped Ory events without custom rule authoring.

## Status

Community / proposed — no dedicated Ory documentation, no first-party handler.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
