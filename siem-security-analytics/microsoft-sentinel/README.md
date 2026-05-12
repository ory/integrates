# Microsoft Sentinel

> **Maintained by:** Community contributors

[Microsoft Sentinel](https://learn.microsoft.com/en-us/azure/sentinel/) is a cloud-native SIEM + SOAR on Azure. Ingest Ory identity events into Sentinel via the **Azure Log Analytics Data Collector API**, enabling KQL hunts and automated Logic Apps playbooks.

**Type:** webhook (Ory Action → handler → Log Analytics ingest) — wiring is Ory Action config + customer-implemented handler
**Docs page:** No dedicated Sentinel page on ory.com/docs.

## How it works

1. Ory fires Actions on registration / login / logout / verification / MFA / recovery events.
2. Handler verifies the Ory webhook secret.
3. Handler POSTs the event (signed with the workspace shared key per Microsoft's HMAC-SHA256 scheme) to `https://<workspace-id>.ods.opinsights.azure.com/api/logs?api-version=2016-04-01` under a custom log type (e.g. `OryEvents_CL`).
4. Sentinel surfaces the events for KQL querying, analytics rules, and Logic Apps playbook triggers.

## Setup outline

1. Get the **Workspace ID** and **Primary Key** from the Log Analytics workspace (Azure portal → Log Analytics → Agents).
2. Build a webhook handler that:
   - Authenticates each POST with the Azure HMAC-SHA256 signature scheme over the request body + headers.
   - Posts events as JSON arrays under the chosen log type (Sentinel auto-creates the table on first ingest).
3. Configure Ory Actions on each lifecycle hook (async, `response.ignore: true`) pointing at the handler.
4. In Sentinel → **Analytics** → **Create rule** → write KQL detection rules against `OryEvents_CL`.

## Notable

- The Data Collector API is being **deprecated in favor of the newer Logs Ingestion API + DCRs**; new deployments should target the Logs Ingestion API. The old Data Collector API still works but watch Microsoft's deprecation timeline.
- Custom log type names are suffixed with `_CL` by Log Analytics automatically — `OryEvents_CL` is the convention.
- For ingest from Ory Network directly (no handler), consider Logic Apps as the intermediary — a single Logic App can receive the Ory Action webhook and post to Sentinel without you running custom code.

## Status

Community / proposed — no dedicated Ory documentation, no first-party handler.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
