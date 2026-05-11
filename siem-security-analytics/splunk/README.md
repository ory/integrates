# Splunk + Ory Network Integration

## Overview

[Splunk](https://www.splunk.com/) is a leading platform for security information and event management (SIEM), log analysis, and operational intelligence. This integration ingests Ory Network identity and authentication events into Splunk via the HTTP Event Collector (HEC), mapping them to Splunk's Common Information Model (CIM) Authentication data model for standardized security monitoring.

## Integration Architecture

Ory Network generates identity lifecycle and authentication events that are forwarded to Splunk through one of two primary paths:

```
Path 1: Live Event Streams (Enterprise)

  Ory Network ──► AWS SNS ──► AWS Lambda ──► Splunk HEC
  (Live Event                   (transform     (index &
   Streams)                      to CIM)        search)

Path 2: Ory Actions Webhook (All Plans)

  Ory Network ──► Webhook ──► Relay Service ──► Splunk HEC
  (Ory Actions)                (transform        (index &
                                to CIM)           search)
```

### Event Sources

| Source | Availability | Events | Latency |
|---|---|---|---|
| Live Event Streams | Enterprise plans | All identity events (comprehensive) | Near real-time (seconds) |
| Ory Actions Webhooks | All plans | Triggered on specific flows (login, registration, etc.) | Real-time |

### Splunk Ingestion

Events are sent to Splunk via the **HTTP Event Collector (HEC)**, which accepts JSON payloads over HTTPS. Events are indexed into a dedicated index and mapped to the CIM Authentication data model.

## Event Mapping — Ory Events to Splunk CIM

### CIM Authentication Data Model Mapping

Ory events map to Splunk's [Authentication Data Model](https://docs.splunk.com/Documentation/CIM/latest/User/Authentication):

| CIM Field | Ory Event Field | Description |
|---|---|---|
| `action` | Derived from event type | `success`, `failure`, `lockout` |
| `app` | `"ory_network"` | Application name |
| `authentication_method` | `event.method` | `password`, `oidc`, `webauthn`, `totp`, `code` |
| `dest` | Ory project slug | Destination system |
| `duration` | Computed | Time to complete auth flow |
| `reason` | `event.error.reason` | Failure reason |
| `signature` | Event type string | Event signature |
| `src` | `event.client_ip` | Source IP address |
| `src_user` | `event.identity.traits.email` | Username/email |
| `user` | `event.identity.id` | Ory identity ID |
| `user_agent` | `event.user_agent` | Client user agent |
| `vendor_product` | `"Ory Network"` | Vendor product name |

### Ory Event Types to CIM Actions

| Ory Event | CIM `action` | CIM `signature` |
|---|---|---|
| `login.succeeded` | `success` | `authentication_success` |
| `login.failed` | `failure` | `authentication_failure` |
| `registration.succeeded` | `success` | `account_created` |
| `registration.failed` | `failure` | `account_creation_failure` |
| `recovery.succeeded` | `success` | `password_reset` |
| `settings.mfa_enabled` | `success` | `mfa_enrollment` |
| `settings.mfa_disabled` | `success` | `mfa_unenrollment` |
| `session.revoked` | `success` | `session_terminated` |
| `identity.deleted` | `success` | `account_deleted` |
| `verification.succeeded` | `success` | `email_verified` |

## Configuration

### 1. Set Up Splunk HEC

#### Create a HEC Token

1. In Splunk, navigate to **Settings > Data Inputs > HTTP Event Collector**.
2. Click **New Token**.
3. Configure:
   - **Name:** `ory-network-events`
   - **Source type:** `_json`
   - **Index:** `ory_identity_events` (create this index first)
   - **App Context:** `search`
4. Copy the generated HEC token.

#### Create a Dedicated Index

```
# In Splunk (Settings > Indexes > New Index)
Index name:    ory_identity_events
Max size:      depends on retention needs
Retention:     365 days (adjust per compliance)
```

#### HEC Endpoint

```
URL:    https://your-splunk-instance:8088/services/collector/event
Method: POST
Header: Authorization: Splunk <HEC-TOKEN>
```

### 2. Ory Actions Webhook Configuration (All Plans)

Configure an Ory Action webhook that fires on authentication events and sends them to a relay service.

#### Ory Actions Webhook Jsonnet Template

This Jsonnet template formats Ory identity events for Splunk CIM consumption:

```jsonnet
// ory-webhook-splunk.jsonnet
// Formats Ory Actions webhook payloads for Splunk HEC ingestion
// Maps to Splunk CIM Authentication data model

function(ctx) {
  local identity = if std.objectHas(ctx, "identity") then ctx.identity else {},
  local traits = if std.objectHas(identity, "traits") then identity.traits else {},
  local flow = if std.objectHas(ctx, "flow") then ctx.flow else {},
  local request = if std.objectHas(ctx, "request") then ctx.request else {},

  // Determine the CIM action based on flow type and success
  local cim_action =
    if std.objectHas(ctx, "error") then "failure"
    else "success",

  // Determine authentication method
  local auth_method =
    if std.objectHas(flow, "active_method") then flow.active_method
    else if std.objectHas(ctx, "method") then ctx.method
    else "unknown",

  // Build the Splunk HEC payload
  event: {
    // CIM Authentication fields
    action: cim_action,
    app: "ory_network",
    authentication_method: auth_method,
    dest: if std.objectHas(ctx, "project_id") then ctx.project_id else "ory_network",
    reason: if std.objectHas(ctx, "error") then ctx.error.reason else "",
    signature: if std.objectHas(ctx, "flow_type") then ctx.flow_type else "authentication",
    src: if std.objectHas(request, "client_ip") then request.client_ip else "",
    src_user: if std.objectHas(traits, "email") then traits.email else "",
    user: if std.objectHas(identity, "id") then identity.id else "",
    user_agent: if std.objectHas(request, "user_agent") then request.user_agent else "",
    vendor_product: "Ory Network",

    // Additional Ory-specific fields
    ory_flow_id: if std.objectHas(flow, "id") then flow.id else "",
    ory_session_id: if std.objectHas(ctx, "session_id") then ctx.session_id else "",
    ory_identity_schema: if std.objectHas(identity, "schema_id") then identity.schema_id else "",
    ory_aal: if std.objectHas(ctx, "authenticator_assurance_level") then ctx.authenticator_assurance_level else "",
  },
  sourcetype: "ory:identity:event",
  source: "ory_network",
  index: "ory_identity_events",
  time: std.toString(std.floor(std.time())),
}
```

#### Configure the Ory Action

```bash
# Create the webhook action via Ory CLI
ory create action \
  --project $ORY_PROJECT_ID \
  --name "Splunk SIEM Forwarding" \
  --type webhook \
  --trigger after \
  --flows login,registration,recovery,settings,verification \
  --url "https://your-relay-service.example.com/ory-to-splunk" \
  --method POST \
  --body "base64://$(cat ory-webhook-splunk.jsonnet | base64)"
```

### 3. Relay Service (Lambda / Cloud Function)

A lightweight relay service receives the Ory webhook, applies the Jsonnet transform, and forwards to Splunk HEC.

```javascript
// relay-service/index.mjs — AWS Lambda or Cloud Function
// Receives Ory Actions webhook and forwards to Splunk HEC

const SPLUNK_HEC_URL = process.env.SPLUNK_HEC_URL;     // https://splunk:8088/services/collector/event
const SPLUNK_HEC_TOKEN = process.env.SPLUNK_HEC_TOKEN;

export const handler = async (event) => {
  const body = JSON.parse(event.body);

  // Build Splunk HEC event from Ory webhook payload
  const splunkEvent = {
    event: {
      action: body.error ? "failure" : "success",
      app: "ory_network",
      authentication_method: body.flow?.active_method || body.method || "unknown",
      dest: body.project_id || "ory_network",
      reason: body.error?.reason || "",
      signature: body.flow_type || "authentication",
      src: body.request?.client_ip || "",
      src_user: body.identity?.traits?.email || "",
      user: body.identity?.id || "",
      user_agent: body.request?.user_agent || "",
      vendor_product: "Ory Network",
      ory_flow_id: body.flow?.id || "",
      ory_session_id: body.session_id || "",
      ory_aal: body.authenticator_assurance_level || "",
    },
    sourcetype: "ory:identity:event",
    source: "ory_network",
    index: "ory_identity_events",
  };

  const resp = await fetch(SPLUNK_HEC_URL, {
    method: "POST",
    headers: {
      "Authorization": `Splunk ${SPLUNK_HEC_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(splunkEvent),
  });

  if (!resp.ok) {
    console.error("Splunk HEC error:", resp.status, await resp.text());
    return { statusCode: 502, body: "Failed to forward to Splunk" };
  }

  return { statusCode: 200, body: "OK" };
};
```

### 4. Live Event Streams Pipeline (Enterprise)

For enterprise customers, Ory Live Event Streams delivers events to AWS SNS. An AWS Lambda subscriber transforms and forwards events to Splunk.

```javascript
// live-events-to-splunk/index.mjs — SNS-triggered Lambda
const SPLUNK_HEC_URL = process.env.SPLUNK_HEC_URL;
const SPLUNK_HEC_TOKEN = process.env.SPLUNK_HEC_TOKEN;

export const handler = async (event) => {
  const results = await Promise.allSettled(
    event.Records.map(async (record) => {
      const snsMessage = JSON.parse(record.Sns.Message);

      const splunkEvent = {
        event: {
          action: snsMessage.type?.includes("failed") ? "failure" : "success",
          app: "ory_network",
          authentication_method: snsMessage.data?.method || "unknown",
          dest: snsMessage.project_id || "ory_network",
          signature: snsMessage.type || "identity_event",
          src: snsMessage.data?.client_ip || "",
          src_user: snsMessage.data?.identity?.traits?.email || "",
          user: snsMessage.data?.identity?.id || "",
          user_agent: snsMessage.data?.user_agent || "",
          vendor_product: "Ory Network",
          raw_event: snsMessage,
        },
        sourcetype: "ory:identity:event",
        source: "ory_live_events",
        index: "ory_identity_events",
        time: snsMessage.timestamp
          ? String(new Date(snsMessage.timestamp).getTime() / 1000)
          : undefined,
      };

      const resp = await fetch(SPLUNK_HEC_URL, {
        method: "POST",
        headers: {
          "Authorization": `Splunk ${SPLUNK_HEC_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(splunkEvent),
      });

      if (!resp.ok) {
        throw new Error(`Splunk HEC returned ${resp.status}`);
      }
    })
  );

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error("Some events failed:", failures);
    throw new Error(`${failures.length} of ${results.length} events failed`);
  }
};
```

## Example Dashboards & Alerts

### SPL Queries

#### Failed Login Rate (Last 24 Hours)

```spl
index=ory_identity_events sourcetype="ory:identity:event" action="failure" signature="authentication_failure"
| timechart span=1h count AS failed_logins
| where failed_logins > 0
```

#### Credential Stuffing Detection

```spl
index=ory_identity_events sourcetype="ory:identity:event" action="failure" signature="authentication_failure"
| stats count AS attempts dc(src_user) AS unique_users BY src
| where attempts > 50 AND unique_users > 10
| sort - attempts
| rename src AS "Source IP", attempts AS "Total Attempts", unique_users AS "Unique Accounts Targeted"
```

#### Brute Force Detection (Single Account)

```spl
index=ory_identity_events sourcetype="ory:identity:event" action="failure" signature="authentication_failure"
| stats count AS attempts dc(src) AS unique_ips BY src_user
| where attempts > 10
| sort - attempts
| rename src_user AS "Account", attempts AS "Failed Attempts", unique_ips AS "Unique IPs"
```

#### Impossible Travel Detection

```spl
index=ory_identity_events sourcetype="ory:identity:event" action="success" signature="authentication_success"
| iplocation src
| stats earliest(_time) AS first_login latest(_time) AS last_login
        values(City) AS cities values(Country) AS countries
        BY user
| where mvcount(cities) > 1
| eval time_diff_hours = round((last_login - first_login) / 3600, 2)
| where time_diff_hours < 1
| rename user AS "Identity ID", cities AS "Login Cities", time_diff_hours AS "Hours Between Logins"
```

#### MFA Adoption Tracking

```spl
index=ory_identity_events sourcetype="ory:identity:event"
  (signature="mfa_enrollment" OR signature="authentication_success")
| stats dc(user) AS total_users BY ory_aal
| rename ory_aal AS "Assurance Level", total_users AS "Unique Users"
```

#### New Account Registration Spike

```spl
index=ory_identity_events sourcetype="ory:identity:event" signature="account_created"
| timechart span=1h count AS registrations
| eventstats avg(registrations) AS avg_registrations stdev(registrations) AS stdev_registrations
| eval upper_bound = avg_registrations + (3 * stdev_registrations)
| where registrations > upper_bound
```

#### Session Anomalies — Multiple Concurrent Sessions

```spl
index=ory_identity_events sourcetype="ory:identity:event" action="success" signature="authentication_success"
| stats dc(ory_session_id) AS active_sessions BY user
| where active_sessions > 5
| sort - active_sessions
```

### Recommended Splunk Alerts

| Alert Name | SPL Condition | Severity | Threshold |
|---|---|---|---|
| Credential Stuffing | Failed logins from single IP > 50, targeting > 10 accounts | Critical | 1 min |
| Brute Force | Failed logins for single account > 10 in 5 min | High | 5 min |
| Impossible Travel | Same user, different cities, < 1 hr apart | High | 15 min |
| Registration Spike | Registrations > 3x standard deviation | Medium | 1 hr |
| MFA Disabled | `signature="mfa_unenrollment"` | Medium | Real-time |
| Account Takeover Pattern | Password reset followed by MFA change | Critical | Real-time |

## Use Cases

### 1. Credential Stuffing Detection

Monitor for high volumes of failed logins from a single IP targeting many different accounts. Correlate with threat intelligence feeds for known bad IPs.

### 2. Account Takeover Investigation

Trace the sequence: successful login from new IP -> password change -> MFA change -> session from new location. Trigger incident response workflows.

### 3. Compliance Reporting

Generate reports for SOC 2, GDPR, or HIPAA compliance showing:
- Who accessed what and when
- Failed access attempts
- Account lifecycle events (creation, deletion, modification)
- MFA enrollment rates

### 4. Insider Threat Detection

Detect unusual patterns: logins outside business hours, access from unusual locations, bulk account enumeration attempts.

### 5. Security Operations Center (SOC) Dashboard

Real-time dashboard showing:
- Authentication success/failure rates
- Top targeted accounts
- Geographic distribution of logins
- Active threat indicators

## Resources

- [Splunk HTTP Event Collector](https://docs.splunk.com/Documentation/Splunk/latest/Data/UsetheHTTPEventCollector)
- [Splunk CIM Authentication Data Model](https://docs.splunk.com/Documentation/CIM/latest/User/Authentication)
- [Splunk SPL Reference](https://docs.splunk.com/Documentation/Splunk/latest/SearchReference)
- [Ory Actions Webhooks](https://www.ory.sh/docs/actions/webhooks)
- [Ory Live Event Streams](https://www.ory.sh/docs/actions/live-events)
- [Ory Identity Events](https://www.ory.sh/docs/actions/hooks)
