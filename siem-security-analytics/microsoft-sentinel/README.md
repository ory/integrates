# Microsoft Sentinel

> **Maintained by:** Community contributors

[Microsoft Sentinel](https://learn.microsoft.com/en-us/azure/sentinel/) is a cloud-native SIEM + SOAR on Azure. Ingest Ory identity events into a Log Analytics workspace through the **Logs Ingestion API** and a data collection rule (DCR), enabling KQL hunts and automated Logic Apps playbooks.

**Type:** webhook (Ory Action → handler → Log Analytics ingest) — wiring is Ory Action config + customer-implemented handler
**Docs page:** [ory.com/docs/integrates-with/siem-security-analytics/microsoft-sentinel](https://www.ory.com/docs/integrates-with/siem-security-analytics/microsoft-sentinel)

## How it works

1. Ory fires Actions after registration, login, settings, recovery, and verification.
2. Handler verifies the Ory webhook secret.
3. Handler gets a Microsoft Entra access token through the client credentials flow and POSTs a JSON array of events to `https://<dce-or-dcr-ingestion-endpoint>/dataCollectionRules/<dcr-immutable-id>/streams/<stream-name>?api-version=2023-01-01`. The DCR routes the events into a custom table such as `OryEvents_CL`.

The handler is required because Ory Actions authenticate only with a static API key or basic auth, and the Logs Ingestion API needs a short-lived Microsoft Entra token.
4. Sentinel surfaces the events for KQL querying, analytics rules, and Logic Apps playbook triggers.

## Setup outline

1. Create a custom table (for example `OryEvents_CL`), a data collection rule with a stream for Ory events, and, if your DCR has no ingestion endpoint of its own, a data collection endpoint.
2. Register a Microsoft Entra application and grant it the **Monitoring Metrics Publisher** role on the DCR.
3. Build a webhook handler that:
   - Gets and caches an Entra access token for `https://monitor.azure.com/.default` with the client credentials flow.
   - Posts events as JSON arrays to the DCR stream.
4. Configure Ory Actions on each lifecycle hook (async, `response.ignore: true`) pointing at the handler. Put each action in the method-specific lists, such as `selfservice.flows.registration.after.password.hooks` and `selfservice.flows.login.after.password.hooks`, and repeat it for every method you enable, such as `oidc` or `code`. Ory Kratos Identities runs the flow-level `after.hooks` lists only for a method that has no hooks of its own, and on Ory Network the registration `password` list always contains `session`; keep `session` last. Recovery and verification have only flow-level lists, such as `selfservice.flows.verification.after.hooks`. See [Attach `after` actions to authentication methods](https://www.ory.com/docs/kratos/hooks/configure-hooks#attach-after-actions-to-authentication-methods). Take the client IP from the `True-Client-Ip` request header.
5. In Sentinel → **Analytics** → **Create rule** → write KQL detection rules against `OryEvents_CL`.

## Notable

- Microsoft ended support for the HTTP Data Collector API (`https://<workspace-id>.ods.opinsights.azure.com/api/logs`) on September 14, 2026. Use the Logs Ingestion API for new deployments and migrate existing ones.
- Custom table names end with `_CL` — `OryEvents_CL` is the convention.
- For ingest from Ory Network directly (no handler), consider Logic Apps as the intermediary — a single Logic App can receive the Ory Action webhook and post to Sentinel without you running custom code.

## Status

Community / proposed — no dedicated Ory documentation, no first-party handler.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
