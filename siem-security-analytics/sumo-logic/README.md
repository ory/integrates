# Sumo Logic + Ory Network Integration

## Overview

[Sumo Logic](https://www.sumologic.com/) is a cloud-native machine data analytics platform that provides log management, security analytics (Cloud SIEM), and observability. This integration ingests Ory Network identity and authentication events into Sumo Logic via an HTTP Source (Hosted Collector), enabling security monitoring, threat detection, and compliance reporting.

## Integration Architecture

Ory Network events are forwarded to Sumo Logic's HTTP Source endpoint, where they are parsed, indexed, and made available for search, dashboards, and Cloud SIEM correlation.

```
Path 1: Ory Actions Webhook (All Plans)

  Ory Network ──► Webhook ──► Relay Service ──► Sumo Logic HTTP Source
  (Ory Actions)                (transform)       (Hosted Collector)
                                                       │
                                                       ▼
                                                  Search & Dashboards
                                                  Cloud SIEM (Enterprise)

Path 2: Live Event Streams (Enterprise)

  Ory Network ──► AWS SNS ──► Lambda ──► Sumo Logic HTTP Source
  (Live Event                  (relay)    (Hosted Collector)
   Streams)
```

### Event Sources

| Source | Availability | Latency |
|---|---|---|
| Ory Actions Webhooks | All plans | Real-time |
| Live Event Streams | Enterprise plans | Near real-time |

## Event Mapping — Ory Events to Sumo Logic Schema

### Field Mapping

Ory events are ingested as structured JSON logs. Sumo Logic's field extraction parses them automatically.

| Sumo Logic Field | Ory Event Field | Description |
|---|---|---|
| `_messagetime` | Event timestamp | Ingestion time |
| `event_type` | Flow type | e.g., `login.succeeded` |
| `event_outcome` | Derived | `success` or `failure` |
| `auth_method` | `method` / `flow.active_method` | `password`, `oidc`, `webauthn`, etc. |
| `identity_id` | `identity.id` | Ory identity UUID |
| `user_email` | `identity.traits.email` | User email |
| `source_ip` | `request.client_ip` | Client IP address |
| `user_agent` | `request.user_agent` | Client user agent |
| `project_id` | `project_id` | Ory project identifier |
| `flow_id` | `flow.id` | Ory flow UUID |
| `session_id` | `session_id` | Ory session UUID |
| `aal` | `authenticator_assurance_level` | `aal1` or `aal2` |
| `error_reason` | `error.reason` | Failure reason |

### Cloud SIEM Record Mapping

For Sumo Logic Cloud SIEM, map Ory events to [normalized authentication records](https://help.sumologic.com/docs/cse/schema/):

| SIEM Field | Ory Value |
|---|---|
| `metadata_vendor` | `Ory` |
| `metadata_product` | `Ory Network` |
| `metadata_deviceEventId` | Event type string |
| `normalizedAction` | `logon` / `create` / `change` |
| `success` | `true` / `false` |
| `srcDevice_ip` | `request.client_ip` |
| `user_username` | `identity.traits.email` |
| `user_userId` | `identity.id` |

## Configuration

### 1. Set Up Sumo Logic HTTP Source

#### Create a Hosted Collector

1. In Sumo Logic, go to **Manage Data > Collection > Collection**.
2. Click **Add Collector > Hosted Collector**.
3. Configure:
   - **Name:** `Ory Network Events`
   - **Category:** `security/identity/ory`

#### Create an HTTP Source

1. On the Hosted Collector, click **Add Source > HTTP Logs & Metrics**.
2. Configure:
   - **Name:** `ory-identity-events`
   - **Source Category:** `security/identity/ory`
   - **Timestamp Parsing:** Auto-detect or ISO 8601
   - **Processing Rules:** (optional) Add field extraction rules
3. Copy the **HTTP Source URL** (e.g., `https://collectors.us2.sumologic.com/receiver/v1/http/XXXX`).

#### HTTP Source Endpoint

```
URL:    https://collectors.{deployment}.sumologic.com/receiver/v1/http/{unique-token}
Method: POST
Header: Content-Type: application/json
```

### 2. Ory Actions Webhook Jsonnet Template

```jsonnet
// ory-webhook-sumologic.jsonnet
// Formats Ory Actions webhook payloads for Sumo Logic ingestion

function(ctx) {
  local identity = if std.objectHas(ctx, "identity") then ctx.identity else {},
  local traits = if std.objectHas(identity, "traits") then identity.traits else {},
  local flow = if std.objectHas(ctx, "flow") then ctx.flow else {},
  local request = if std.objectHas(ctx, "request") then ctx.request else {},

  event_type: if std.objectHas(ctx, "flow_type") then ctx.flow_type else "unknown",
  event_outcome:
    if std.objectHas(ctx, "error") then "failure"
    else "success",
  auth_method:
    if std.objectHas(ctx, "method") then ctx.method
    else if std.objectHas(flow, "active_method") then flow.active_method
    else "unknown",
  identity_id: if std.objectHas(identity, "id") then identity.id else "",
  user_email: if std.objectHas(traits, "email") then traits.email else "",
  source_ip: if std.objectHas(request, "client_ip") then request.client_ip else "",
  user_agent: if std.objectHas(request, "user_agent") then request.user_agent else "",
  project_id: if std.objectHas(ctx, "project_id") then ctx.project_id else "",
  flow_id: if std.objectHas(flow, "id") then flow.id else "",
  session_id: if std.objectHas(ctx, "session_id") then ctx.session_id else "",
  aal: if std.objectHas(ctx, "authenticator_assurance_level") then ctx.authenticator_assurance_level else "",
  error_reason: if std.objectHas(ctx, "error") then ctx.error.reason else "",
  timestamp: std.toString(std.time()),

  // Sumo Logic Cloud SIEM fields (for normalized records)
  metadata_vendor: "Ory",
  metadata_product: "Ory Network",
  metadata_deviceEventId: if std.objectHas(ctx, "flow_type") then ctx.flow_type else "unknown",
}
```

### 3. Configure the Ory Action

```bash
ory create action \
  --project $ORY_PROJECT_ID \
  --name "Sumo Logic SIEM Forwarding" \
  --type webhook \
  --trigger after \
  --flows login,registration,recovery,settings,verification \
  --url "https://your-relay-service.example.com/ory-to-sumologic" \
  --method POST \
  --body "base64://$(cat ory-webhook-sumologic.jsonnet | base64)"
```

### 4. Relay Service

A lightweight relay service receives the Ory webhook and forwards to Sumo Logic's HTTP Source.

```javascript
// relay-service/index.mjs
const SUMO_HTTP_SOURCE_URL = process.env.SUMO_HTTP_SOURCE_URL;

export const handler = async (event) => {
  const body = JSON.parse(event.body);

  // Build the Sumo Logic log entry
  const logEntry = {
    event_type: body.flow_type || "unknown",
    event_outcome: body.error ? "failure" : "success",
    auth_method: body.method || body.flow?.active_method || "unknown",
    identity_id: body.identity?.id || "",
    user_email: body.identity?.traits?.email || "",
    source_ip: body.request?.client_ip || "",
    user_agent: body.request?.user_agent || "",
    project_id: body.project_id || "",
    flow_id: body.flow?.id || "",
    session_id: body.session_id || "",
    aal: body.authenticator_assurance_level || "",
    error_reason: body.error?.reason || "",
    timestamp: new Date().toISOString(),
    metadata_vendor: "Ory",
    metadata_product: "Ory Network",
  };

  const resp = await fetch(SUMO_HTTP_SOURCE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Optional: set source category and metadata headers
      "X-Sumo-Category": "security/identity/ory",
      "X-Sumo-Name": "ory-identity-events",
      "X-Sumo-Host": "ory-network",
    },
    body: JSON.stringify(logEntry),
  });

  if (!resp.ok) {
    console.error("Sumo Logic error:", resp.status, await resp.text());
    return { statusCode: 502, body: "Failed to forward to Sumo Logic" };
  }

  return { statusCode: 200, body: "OK" };
};
```

### 5. Live Event Streams Pipeline (Enterprise)

```javascript
// live-events-to-sumologic/index.mjs — SNS-triggered Lambda
const SUMO_HTTP_SOURCE_URL = process.env.SUMO_HTTP_SOURCE_URL;

export const handler = async (event) => {
  // Batch all SNS records into a single Sumo Logic request
  // (Sumo accepts newline-delimited JSON)
  const lines = event.Records.map((record) => {
    const msg = JSON.parse(record.Sns.Message);
    return JSON.stringify({
      event_type: msg.type || "unknown",
      event_outcome: msg.type?.includes("failed") ? "failure" : "success",
      auth_method: msg.data?.method || "unknown",
      identity_id: msg.data?.identity?.id || "",
      user_email: msg.data?.identity?.traits?.email || "",
      source_ip: msg.data?.client_ip || "",
      user_agent: msg.data?.user_agent || "",
      project_id: msg.project_id || "",
      session_id: msg.data?.session_id || "",
      aal: msg.data?.authenticator_assurance_level || "",
      timestamp: msg.timestamp || new Date().toISOString(),
      metadata_vendor: "Ory",
      metadata_product: "Ory Network",
    });
  });

  const resp = await fetch(SUMO_HTTP_SOURCE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sumo-Category": "security/identity/ory",
      "X-Sumo-Name": "ory-live-events",
    },
    body: lines.join("\n"),
  });

  if (!resp.ok) {
    throw new Error(`Sumo Logic returned ${resp.status}`);
  }
};
```

### 6. Field Extraction Rules (FER)

Create a Field Extraction Rule in Sumo Logic to automatically parse Ory events:

```
Scope:      _sourceCategory=security/identity/ory
Rule Name:  Ory Identity Events
Parse Expression:
  | json "event_type", "event_outcome", "auth_method", "identity_id",
         "user_email", "source_ip", "user_agent", "project_id",
         "flow_id", "session_id", "aal", "error_reason",
         "metadata_vendor", "metadata_product"
```

## Example Dashboards & Alerts

### Log Queries

#### Failed Login Rate (Last 24 Hours)

```
_sourceCategory=security/identity/ory
| json "event_type", "event_outcome", "source_ip", "user_email"
| where event_outcome = "failure" and event_type = "login"
| timeslice 1h
| count by _timeslice
| order by _timeslice asc
```

#### Credential Stuffing Detection

```
_sourceCategory=security/identity/ory
| json "event_type", "event_outcome", "source_ip", "user_email"
| where event_outcome = "failure" and event_type = "login"
| where _timeslice >= now() - 15m
| count_distinct(user_email) as unique_accounts, count as total_attempts by source_ip
| where total_attempts > 50 and unique_accounts > 10
| sort by total_attempts desc
```

#### Brute Force Detection (Single Account)

```
_sourceCategory=security/identity/ory
| json "event_type", "event_outcome", "source_ip", "user_email"
| where event_outcome = "failure" and event_type = "login"
| where _timeslice >= now() - 1h
| count_distinct(source_ip) as unique_ips, count as failed_attempts by user_email
| where failed_attempts > 10
| sort by failed_attempts desc
```

#### Impossible Travel Detection

```
_sourceCategory=security/identity/ory
| json "event_type", "event_outcome", "source_ip", "identity_id", "user_email"
| where event_outcome = "success" and event_type = "login"
| lookup latitude, longitude, country_name, city from geo://location on ip = source_ip
| sort by identity_id, _messagetime asc
| sessionize identity_id
| join
  (
    _sourceCategory=security/identity/ory
    | json "event_type", "event_outcome", "source_ip", "identity_id"
    | where event_outcome = "success" and event_type = "login"
    | lookup city as prev_city from geo://location on ip = source_ip
  ) on identity_id
| where city != prev_city
| where _messagetime - _messagetime_prev < 3600000
```

#### MFA Adoption Tracking

```
_sourceCategory=security/identity/ory
| json "event_type", "event_outcome", "aal", "identity_id"
| where event_outcome = "success" and event_type = "login"
| timeslice 1d
| count_distinct(identity_id) as users by _timeslice, aal
| transpose row _timeslice column aal
```

#### Registration Spike Detection

```
_sourceCategory=security/identity/ory
| json "event_type", "event_outcome"
| where event_type = "registration" and event_outcome = "success"
| timeslice 1h
| count by _timeslice
| outlier _count
| where _count_violation > 0
```

#### Top Authentication Methods

```
_sourceCategory=security/identity/ory
| json "event_type", "event_outcome", "auth_method"
| where event_type = "login" and event_outcome = "success"
| count by auth_method
| sort by _count desc
```

#### Session Activity Per User

```
_sourceCategory=security/identity/ory
| json "event_type", "event_outcome", "identity_id", "user_email", "session_id"
| where event_outcome = "success"
| count_distinct(session_id) as active_sessions by identity_id, user_email
| where active_sessions > 5
| sort by active_sessions desc
```

### Recommended Alerts

| Alert Name | Query Condition | Threshold | Severity | Window |
|---|---|---|---|---|
| Credential Stuffing | Failed logins from single IP > 50, targeting > 10 accounts | > 0 results | Critical | 15 min |
| Brute Force | Failed logins for single account > 10 | > 0 results | High | 5 min |
| Registration Spike | New registrations > 3x outlier | Outlier violation | Medium | 1 hr |
| MFA Disabled | `event_type = "mfa_unenrollment"` | > 0 | Medium | Real-time |
| Account Takeover Pattern | Password reset + MFA change within 1 hr | > 0 | Critical | 1 hr |
| Impossible Travel | Same user, different geo, < 1 hr | > 0 | High | 15 min |

### Creating Scheduled Alerts

```
# Example: Credential Stuffing Alert (via Sumo Logic UI or Terraform)

_sourceCategory=security/identity/ory
| json "event_type", "event_outcome", "source_ip", "user_email"
| where event_outcome = "failure" and event_type = "login"
| count_distinct(user_email) as unique_accounts, count as total_attempts by source_ip
| where total_attempts > 50 and unique_accounts > 10

# Schedule: Every 15 minutes
# Alert condition: Number of results > 0
# Notification: Email, Slack, PagerDuty, webhook
```

## Use Cases

### 1. Credential Stuffing Detection

Aggregate failed logins by source IP. Correlate with Sumo Logic's built-in threat intelligence to identify known malicious IPs. Use Sumo Logic Cloud SIEM (Enterprise) for automated signal correlation.

### 2. Account Takeover Investigation

Use the search interface to reconstruct the event timeline for a specific identity. Filter by `identity_id` to see all authentication events, settings changes, and session activity.

### 3. Compliance & Audit Reporting

Create scheduled searches and dashboards for compliance reporting:
- Authentication activity summary (daily/weekly/monthly)
- Failed login trends
- MFA adoption rates
- Account lifecycle events
- Export results to CSV for auditors

### 4. Cloud SIEM Integration (Enterprise)

With Sumo Logic Cloud SIEM, Ory events are automatically correlated with other security signals:
- Map Ory events to SIEM normalized records
- Create custom match rules and chain rules
- Generate signals and insights from Ory authentication patterns
- Correlate with network, endpoint, and cloud security events

### 5. Real-Time Operational Monitoring

Build live dashboards showing:
- Authentication success/failure rates
- Active user sessions
- Registration trends
- Geographic distribution of logins
- Error rates and types

## Resources

- [Sumo Logic HTTP Source](https://help.sumologic.com/docs/send-data/hosted-collectors/http-source/logs-metrics/)
- [Sumo Logic Search Query Language](https://help.sumologic.com/docs/search/)
- [Sumo Logic Field Extraction Rules](https://help.sumologic.com/docs/manage/field-extractions/)
- [Sumo Logic Cloud SIEM](https://help.sumologic.com/docs/cse/)
- [Sumo Logic Scheduled Searches & Alerts](https://help.sumologic.com/docs/alerts/scheduled-searches/)
- [Sumo Logic Dashboards](https://help.sumologic.com/docs/dashboards/)
- [Ory Actions Webhooks](https://www.ory.sh/docs/actions/webhooks)
- [Ory Live Event Streams](https://www.ory.sh/docs/actions/live-events)
