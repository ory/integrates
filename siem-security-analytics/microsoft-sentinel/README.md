# Microsoft Sentinel + Ory Network Integration

## Overview

[Microsoft Sentinel](https://learn.microsoft.com/en-us/azure/sentinel/) is a cloud-native SIEM and SOAR platform built on Azure. It provides intelligent security analytics, threat detection, and automated response across the enterprise. This integration ingests Ory Network identity and authentication events into Sentinel via the Azure Log Analytics Data Collector API, enabling security monitoring with KQL queries and automated playbooks.

## Integration Architecture

Ory Network events are forwarded to Microsoft Sentinel through Azure infrastructure. The primary ingestion path uses Azure Logic Apps to receive Ory webhooks and write to a custom Log Analytics table.

```
Path 1: Ory Actions + Logic App (All Plans)

  Ory Network ──► Webhook ──► Azure Logic App ──► Log Analytics ──► Sentinel
  (Ory Actions)                (transform &        (Custom Table:    (Analytics
                                ingest)             OryAuthEvents_CL)  Rules &
                                                                       Workbooks)

Path 2: Live Event Streams (Enterprise)

  Ory Network ──► AWS SNS ──► Lambda ──► Azure Event Hub ──► Sentinel
  (Live Event                  (relay)    (ingestion)         (Analytics
   Streams)                                                    Rules)

Path 3: Direct Data Collector API

  Ory Network ──► Webhook ──► Azure Function ──► Data Collector API ──► Sentinel
  (Ory Actions)                (transform)        (HTTP POST)
```

### Event Sources

| Source | Availability | Ingestion Path | Latency |
|---|---|---|---|
| Ory Actions Webhooks | All plans | Logic App / Azure Function | Real-time |
| Live Event Streams | Enterprise | SNS -> Lambda -> Event Hub | Near real-time |

## Event Mapping — Ory Events to Sentinel Schema

### Custom Log Analytics Table: `OryAuthEvents_CL`

| Sentinel Field | Ory Event Field | Type | Description |
|---|---|---|---|
| `TimeGenerated` | Event timestamp | datetime | When the event occurred |
| `EventType_s` | Event type | string | e.g., `login.succeeded` |
| `EventOutcome_s` | Derived | string | `success` or `failure` |
| `AuthMethod_s` | `method` | string | `password`, `oidc`, `webauthn`, etc. |
| `IdentityId_g` | `identity.id` | guid | Ory identity UUID |
| `UserEmail_s` | `identity.traits.email` | string | User email |
| `SourceIP_s` | `request.client_ip` | string | Client IP address |
| `UserAgent_s` | `request.user_agent` | string | Client user agent |
| `ProjectId_s` | `project_id` | string | Ory project identifier |
| `FlowId_g` | `flow.id` | guid | Ory flow UUID |
| `SessionId_g` | `session_id` | guid | Ory session UUID |
| `AAL_s` | `authenticator_assurance_level` | string | `aal1` or `aal2` |
| `ErrorReason_s` | `error.reason` | string | Failure reason |
| `Country_s` | GeoIP lookup | string | Source country |
| `City_s` | GeoIP lookup | string | Source city |

### Ory Event Types

| Ory Event | `EventType_s` | `EventOutcome_s` |
|---|---|---|
| `login.succeeded` | `Login` | `Success` |
| `login.failed` | `Login` | `Failure` |
| `registration.succeeded` | `Registration` | `Success` |
| `registration.failed` | `Registration` | `Failure` |
| `recovery.succeeded` | `PasswordReset` | `Success` |
| `settings.mfa_enabled` | `MFAEnrollment` | `Success` |
| `settings.mfa_disabled` | `MFAUnenrollment` | `Success` |
| `session.revoked` | `SessionRevoked` | `Success` |
| `verification.succeeded` | `EmailVerification` | `Success` |

## Configuration

### 1. Create the Log Analytics Workspace

If you do not already have a workspace connected to Sentinel:

```bash
# Azure CLI
az monitor log-analytics workspace create \
  --resource-group myResourceGroup \
  --workspace-name ory-security-workspace \
  --location eastus

# Enable Sentinel on the workspace
az sentinel onboarding-state create \
  --resource-group myResourceGroup \
  --workspace-name ory-security-workspace
```

Note the **Workspace ID** and **Primary Key** from:

```bash
az monitor log-analytics workspace show \
  --resource-group myResourceGroup \
  --workspace-name ory-security-workspace \
  --query "customerId" -o tsv

az monitor log-analytics workspace get-shared-keys \
  --resource-group myResourceGroup \
  --workspace-name ory-security-workspace \
  --query "primarySharedKey" -o tsv
```

### 2. Azure Logic App — Ory Webhook Connector

Create a Logic App that receives Ory Action webhooks and writes to Log Analytics.

#### Logic App Definition (ARM Template)

```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "logicAppName": {
      "type": "string",
      "defaultValue": "ory-webhook-to-sentinel"
    },
    "workspaceId": {
      "type": "string",
      "metadata": { "description": "Log Analytics Workspace ID" }
    },
    "workspaceKey": {
      "type": "securestring",
      "metadata": { "description": "Log Analytics Primary Key" }
    }
  },
  "resources": [
    {
      "type": "Microsoft.Logic/workflows",
      "apiVersion": "2019-05-01",
      "name": "[parameters('logicAppName')]",
      "location": "[resourceGroup().location]",
      "properties": {
        "state": "Enabled",
        "definition": {
          "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
          "contentVersion": "1.0.0.0",
          "triggers": {
            "When_HTTP_request_is_received": {
              "type": "Request",
              "kind": "Http",
              "inputs": {
                "method": "POST",
                "schema": {
                  "type": "object",
                  "properties": {
                    "flow_type": { "type": "string" },
                    "identity": { "type": "object" },
                    "request": { "type": "object" },
                    "flow": { "type": "object" },
                    "project_id": { "type": "string" },
                    "session_id": { "type": "string" },
                    "authenticator_assurance_level": { "type": "string" },
                    "method": { "type": "string" },
                    "error": { "type": "object" }
                  }
                }
              }
            }
          },
          "actions": {
            "Send_Data_to_Log_Analytics": {
              "type": "ApiConnection",
              "inputs": {
                "host": {
                  "connection": {
                    "name": "@parameters('$connections')['azureloganalyticsdatacollector']['connectionId']"
                  }
                },
                "method": "post",
                "body": {
                  "TimeGenerated": "@{utcNow()}",
                  "EventType_s": "@{triggerBody()?['flow_type']}",
                  "EventOutcome_s": "@{if(equals(triggerBody()?['error'], null), 'Success', 'Failure')}",
                  "AuthMethod_s": "@{coalesce(triggerBody()?['method'], triggerBody()?['flow']?['active_method'], 'unknown')}",
                  "IdentityId_g": "@{triggerBody()?['identity']?['id']}",
                  "UserEmail_s": "@{triggerBody()?['identity']?['traits']?['email']}",
                  "SourceIP_s": "@{triggerBody()?['request']?['client_ip']}",
                  "UserAgent_s": "@{triggerBody()?['request']?['user_agent']}",
                  "ProjectId_s": "@{triggerBody()?['project_id']}",
                  "FlowId_g": "@{triggerBody()?['flow']?['id']}",
                  "SessionId_g": "@{triggerBody()?['session_id']}",
                  "AAL_s": "@{triggerBody()?['authenticator_assurance_level']}",
                  "ErrorReason_s": "@{triggerBody()?['error']?['reason']}"
                },
                "headers": {
                  "Log-Type": "OryAuthEvents"
                },
                "path": "/api/logs"
              },
              "runAfter": {}
            },
            "Response_200": {
              "type": "Response",
              "inputs": {
                "statusCode": 200,
                "body": { "status": "accepted" }
              },
              "runAfter": {
                "Send_Data_to_Log_Analytics": ["Succeeded"]
              }
            }
          }
        },
        "parameters": {
          "$connections": {
            "value": {
              "azureloganalyticsdatacollector": {
                "connectionId": "[resourceId('Microsoft.Web/connections', 'azureloganalyticsdatacollector')]",
                "connectionName": "azureloganalyticsdatacollector",
                "id": "[subscriptionResourceId('Microsoft.Web/locations/managedApis', resourceGroup().location, 'azureloganalyticsdatacollector')]"
              }
            }
          }
        }
      }
    },
    {
      "type": "Microsoft.Web/connections",
      "apiVersion": "2016-06-01",
      "name": "azureloganalyticsdatacollector",
      "location": "[resourceGroup().location]",
      "properties": {
        "displayName": "Log Analytics Data Collector",
        "api": {
          "id": "[subscriptionResourceId('Microsoft.Web/locations/managedApis', resourceGroup().location, 'azureloganalyticsdatacollector')]"
        },
        "parameterValues": {
          "username": "[parameters('workspaceId')]",
          "password": "[parameters('workspaceKey')]"
        }
      }
    }
  ],
  "outputs": {
    "webhookUrl": {
      "type": "string",
      "value": "[listCallbackURL(resourceId('Microsoft.Logic/workflows/triggers', parameters('logicAppName'), 'When_HTTP_request_is_received'), '2019-05-01').value]"
    }
  }
}
```

#### Deploy the Logic App

```bash
az deployment group create \
  --resource-group myResourceGroup \
  --template-file logic-app-template.json \
  --parameters \
    workspaceId="YOUR_WORKSPACE_ID" \
    workspaceKey="YOUR_WORKSPACE_KEY"
```

After deployment, note the webhook URL from the output and configure it in Ory.

### 3. Ory Actions Webhook Jsonnet Template

```jsonnet
// ory-webhook-sentinel.jsonnet
// Formats Ory Actions webhook payloads for Microsoft Sentinel ingestion

function(ctx) {
  local identity = if std.objectHas(ctx, "identity") then ctx.identity else {},
  local traits = if std.objectHas(identity, "traits") then identity.traits else {},
  local flow = if std.objectHas(ctx, "flow") then ctx.flow else {},
  local request = if std.objectHas(ctx, "request") then ctx.request else {},

  flow_type: if std.objectHas(ctx, "flow_type") then ctx.flow_type else "unknown",
  identity: identity,
  request: request,
  flow: flow,
  project_id: if std.objectHas(ctx, "project_id") then ctx.project_id else "",
  session_id: if std.objectHas(ctx, "session_id") then ctx.session_id else "",
  authenticator_assurance_level: if std.objectHas(ctx, "authenticator_assurance_level") then ctx.authenticator_assurance_level else "",
  method: if std.objectHas(ctx, "method") then ctx.method
          else if std.objectHas(flow, "active_method") then flow.active_method
          else "",
  [if std.objectHas(ctx, "error") then "error"]: ctx.error,
}
```

### 4. Configure the Ory Action

```bash
# Get the Logic App webhook URL from the deployment output
LOGIC_APP_URL="https://prod-XX.eastus.logic.azure.com:443/workflows/..."

ory create action \
  --project $ORY_PROJECT_ID \
  --name "Microsoft Sentinel Forwarding" \
  --type webhook \
  --trigger after \
  --flows login,registration,recovery,settings,verification \
  --url "$LOGIC_APP_URL" \
  --method POST \
  --body "base64://$(cat ory-webhook-sentinel.jsonnet | base64)"
```

### 5. Alternative: Azure Function with Data Collector API

For more control over the ingestion, use an Azure Function that calls the Data Collector API directly.

```javascript
// azure-function/OryWebhook/index.mjs
import crypto from 'crypto';

const WORKSPACE_ID = process.env.WORKSPACE_ID;
const WORKSPACE_KEY = process.env.WORKSPACE_KEY;
const LOG_TYPE = 'OryAuthEvents';

export default async function (context, req) {
  const body = req.body;

  const logEntry = {
    TimeGenerated: new Date().toISOString(),
    EventType_s: body.flow_type || 'unknown',
    EventOutcome_s: body.error ? 'Failure' : 'Success',
    AuthMethod_s: body.method || body.flow?.active_method || 'unknown',
    IdentityId_g: body.identity?.id || '',
    UserEmail_s: body.identity?.traits?.email || '',
    SourceIP_s: body.request?.client_ip || '',
    UserAgent_s: body.request?.user_agent || '',
    ProjectId_s: body.project_id || '',
    FlowId_g: body.flow?.id || '',
    SessionId_g: body.session_id || '',
    AAL_s: body.authenticator_assurance_level || '',
    ErrorReason_s: body.error?.reason || '',
  };

  const jsonBody = JSON.stringify([logEntry]);
  const dateString = new Date().toUTCString();

  // Build the authorization signature
  const contentLength = Buffer.byteLength(jsonBody, 'utf8');
  const stringToSign = `POST\n${contentLength}\napplication/json\nx-ms-date:${dateString}\n/api/logs`;
  const signature = crypto
    .createHmac('sha256', Buffer.from(WORKSPACE_KEY, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');
  const authorization = `SharedKey ${WORKSPACE_ID}:${signature}`;

  const url = `https://${WORKSPACE_ID}.ods.opinsights.azure.com/api/logs?api-version=2016-04-01`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authorization,
      'Log-Type': LOG_TYPE,
      'x-ms-date': dateString,
      'time-generated-field': 'TimeGenerated',
    },
    body: jsonBody,
  });

  if (!resp.ok) {
    context.log.error('Data Collector API error:', resp.status, await resp.text());
    context.res = { status: 502, body: 'Failed to ingest' };
    return;
  }

  context.res = { status: 200, body: 'OK' };
}
```

## Example Dashboards & Alerts

### KQL Queries

#### Failed Login Rate (Last 24 Hours)

```kql
OryAuthEvents_CL
| where TimeGenerated > ago(24h)
| where EventType_s == "Login" and EventOutcome_s == "Failure"
| summarize FailedLogins = count() by bin(TimeGenerated, 1h)
| render timechart
```

#### Credential Stuffing Detection

```kql
OryAuthEvents_CL
| where TimeGenerated > ago(15m)
| where EventType_s == "Login" and EventOutcome_s == "Failure"
| summarize
    TotalAttempts = count(),
    UniqueAccounts = dcount(UserEmail_s)
  by SourceIP_s
| where TotalAttempts > 50 and UniqueAccounts > 10
| sort by TotalAttempts desc
```

#### Brute Force Detection (Single Account)

```kql
OryAuthEvents_CL
| where TimeGenerated > ago(1h)
| where EventType_s == "Login" and EventOutcome_s == "Failure"
| summarize
    FailedAttempts = count(),
    UniqueIPs = dcount(SourceIP_s),
    IPs = make_set(SourceIP_s)
  by UserEmail_s
| where FailedAttempts > 10
| sort by FailedAttempts desc
```

#### Impossible Travel

```kql
let login_events = OryAuthEvents_CL
| where EventType_s == "Login" and EventOutcome_s == "Success"
| extend GeoInfo = geo_info_from_ip_address(SourceIP_s)
| extend Country = tostring(GeoInfo.country), City = tostring(GeoInfo.city);
login_events
| sort by IdentityId_g, TimeGenerated asc
| extend PrevTime = prev(TimeGenerated, 1), PrevCity = prev(City, 1), PrevUser = prev(IdentityId_g, 1)
| where IdentityId_g == PrevUser and City != PrevCity
| extend TimeDiffMinutes = datetime_diff('minute', TimeGenerated, PrevTime)
| where TimeDiffMinutes < 60
| project TimeGenerated, IdentityId_g, UserEmail_s, City, PrevCity, TimeDiffMinutes, SourceIP_s
```

#### MFA Adoption

```kql
OryAuthEvents_CL
| where TimeGenerated > ago(30d)
| where EventType_s == "Login" and EventOutcome_s == "Success"
| summarize
    TotalLogins = count(),
    AAL2Logins = countif(AAL_s == "aal2")
  by bin(TimeGenerated, 1d)
| extend MFAPercentage = round(100.0 * AAL2Logins / TotalLogins, 2)
| render timechart
```

#### Account Takeover Pattern

```kql
let suspicious_sequence = OryAuthEvents_CL
| where TimeGenerated > ago(24h)
| where EventOutcome_s == "Success"
| where EventType_s in ("Login", "PasswordReset", "MFAUnenrollment")
| summarize
    EventSequence = make_list(EventType_s),
    EventTimes = make_list(TimeGenerated)
  by IdentityId_g, UserEmail_s
| where array_length(EventSequence) >= 2
| where EventSequence has "PasswordReset" and EventSequence has "MFAUnenrollment";
suspicious_sequence
```

### Sentinel Analytics Rules

#### Brute Force Detection Rule

```json
{
  "displayName": "Ory - Brute Force Login Attempt",
  "description": "Detects more than 10 failed login attempts for a single account within 5 minutes",
  "severity": "High",
  "enabled": true,
  "query": "OryAuthEvents_CL\n| where EventType_s == 'Login' and EventOutcome_s == 'Failure'\n| summarize FailedAttempts = count(), IPs = make_set(SourceIP_s) by UserEmail_s\n| where FailedAttempts > 10",
  "queryFrequency": "PT5M",
  "queryPeriod": "PT5M",
  "triggerOperator": "GreaterThan",
  "triggerThreshold": 0,
  "tactics": ["CredentialAccess"],
  "techniques": ["T1110"]
}
```

#### Credential Stuffing Rule

```json
{
  "displayName": "Ory - Credential Stuffing Attack",
  "description": "Detects high-volume failed logins from a single IP targeting multiple accounts",
  "severity": "Critical",
  "enabled": true,
  "query": "OryAuthEvents_CL\n| where EventType_s == 'Login' and EventOutcome_s == 'Failure'\n| summarize Attempts = count(), UniqueAccounts = dcount(UserEmail_s) by SourceIP_s\n| where Attempts > 50 and UniqueAccounts > 10",
  "queryFrequency": "PT5M",
  "queryPeriod": "PT15M",
  "triggerOperator": "GreaterThan",
  "triggerThreshold": 0,
  "tactics": ["CredentialAccess"],
  "techniques": ["T1110.004"]
}
```

#### MFA Disabled Alert

```json
{
  "displayName": "Ory - MFA Disabled on Account",
  "description": "Alerts when MFA is disabled on any account — potential account takeover indicator",
  "severity": "Medium",
  "enabled": true,
  "query": "OryAuthEvents_CL\n| where EventType_s == 'MFAUnenrollment'",
  "queryFrequency": "PT5M",
  "queryPeriod": "PT5M",
  "triggerOperator": "GreaterThan",
  "triggerThreshold": 0,
  "tactics": ["Persistence", "DefenseEvasion"],
  "techniques": ["T1556"]
}
```

## Use Cases

### 1. Credential Stuffing Detection

Monitor for distributed login failures from single IPs. Correlate with Microsoft Threat Intelligence to identify known malicious IPs. Trigger automated IP blocking via Sentinel Playbooks.

### 2. Account Takeover Response

Detect the pattern: password reset -> login from new IP -> MFA change. Use Sentinel SOAR to automatically:
- Disable the Ory session via API
- Notify the user via email
- Create an incident for SOC review

### 3. Compliance Monitoring

Track authentication events for regulatory compliance (SOC 2, GDPR, HIPAA). Generate scheduled reports via Sentinel Workbooks showing access patterns, failed login trends, and MFA adoption rates.

### 4. Cross-Platform Correlation

Correlate Ory authentication events with:
- Azure AD sign-in logs
- Microsoft 365 audit logs
- Azure resource access logs
- Third-party application logs

Use `IdentityId_g` or `UserEmail_s` as join keys.

### 5. Automated Threat Response (SOAR)

Build Sentinel Playbooks (Logic Apps) that respond to detected threats:
- Block IPs at the network level (Azure Firewall, NSG)
- Revoke Ory sessions via the Ory Admin API
- Send alerts to Slack/Teams
- Create tickets in ServiceNow/Jira

## Resources

- [Microsoft Sentinel Documentation](https://learn.microsoft.com/en-us/azure/sentinel/)
- [Log Analytics Data Collector API](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/data-collector-api)
- [KQL Reference](https://learn.microsoft.com/en-us/kusto/query/)
- [Sentinel Analytics Rules](https://learn.microsoft.com/en-us/azure/sentinel/detect-threats-custom)
- [Sentinel Playbooks (SOAR)](https://learn.microsoft.com/en-us/azure/sentinel/automate-responses-with-playbooks)
- [Azure Logic Apps](https://learn.microsoft.com/en-us/azure/logic-apps/)
- [Ory Actions Webhooks](https://www.ory.sh/docs/actions/webhooks)
- [Ory Live Event Streams](https://www.ory.sh/docs/actions/live-events)
- [MITRE ATT&CK Techniques](https://attack.mitre.org/techniques/)
