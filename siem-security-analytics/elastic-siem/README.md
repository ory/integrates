# Elastic SIEM

> **Maintained by:** Community contributors

[Elastic SIEM](https://www.elastic.co/security/siem) (part of the Elastic Stack) — security analytics, threat detection, incident response, built on Elasticsearch + Kibana. This integration ingests Ory Network identity and authentication events into Elasticsearch, mapping to the **Elastic Common Schema (ECS)** for standardized security monitoring.

**Type:** webhook (Ory Action → handler → Elastic bulk ingest API) — wiring is Ory Action config + customer-implemented handler
**Docs page:** No dedicated Elastic page on ory.com/docs.

## How it works

1. Ory fires Actions on registration / login / logout / verification / MFA / recovery events.
2. Handler verifies the Ory webhook secret.
3. Handler transforms the event to an ECS document and POSTs to Elasticsearch's bulk API at `https://<elastic-host>/_bulk` (or via Fleet Server / Elastic Agent for an Elastic Cloud deployment).
4. Kibana / Elastic Security UI surfaces the events in dashboards, detection rules, and timelines.

## ECS mapping

| Ory event | ECS fields |
| --- | --- |
| Registration | `event.action: user-creation`, `event.category: ["authentication", "iam"]`, `user.id`, `user.email`, `source.ip`, `user_agent.original` |
| Login | `event.action: logon`, `event.category: ["authentication"]`, `event.outcome: success/failure` |
| MFA | `event.action: mfa-challenge`, `event.outcome`, `authentication.factor` |
| Recovery / verification | `event.action: password-reset` / `email-verification` |

## Setup outline

1. Create an Elasticsearch ingest user with `write` privileges on the target index pattern (typically `logs-ory-*`).
2. Build a webhook handler that maps Ory event payloads to ECS documents and bulk-ingests them.
3. Configure Ory Actions on each lifecycle hook (async, `response.ignore: true`) pointing at the handler.

## Notable

- Index Lifecycle Management (ILM): apply an ILM policy to the `logs-ory-*` index for retention + tier transitions (hot → warm → cold) per your compliance window.
- For Fleet-managed deployments, package the handler as a custom Elastic Integration and ship via the Fleet UI.
- Detection rules: pre-built rules in Elastic Security Detection Engine for common identity attacks (brute force, impossible travel, credential stuffing) can target ECS-mapped Ory events without custom rule authoring.

## Status

Community / proposed — no dedicated Ory documentation, no first-party handler.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
