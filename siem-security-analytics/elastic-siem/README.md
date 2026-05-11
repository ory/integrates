# Elastic SIEM / Elasticsearch + Ory Network Integration

## Overview

[Elastic SIEM](https://www.elastic.co/security/siem) (part of the Elastic Stack) provides security analytics, threat detection, and incident response capabilities built on Elasticsearch and Kibana. This integration ingests Ory Network identity and authentication events into Elasticsearch, mapping them to the [Elastic Common Schema (ECS)](https://www.elastic.co/guide/en/ecs/current/index.html) for standardized security monitoring and correlation.

## Integration Architecture

Ory Network events flow into Elasticsearch through Logstash (or a direct API relay), where they are transformed to ECS format and indexed for search, alerting, and visualization in Kibana.

```
Path 1: Live Event Streams (Enterprise)

  Ory Network ──► AWS SNS ──► AWS Lambda ──► Logstash ──► Elasticsearch
  (Live Event                   (relay)       (ECS          (index &
   Streams)                                    transform)    search)

Path 2: Ory Actions Webhook (All Plans)

  Ory Network ──► Webhook ──► Relay Service ──► Logstash ──► Elasticsearch
  (Ory Actions)                (forward)        (ECS          (index &
                                                 transform)    search)

Path 3: Direct API Ingestion (simpler)

  Ory Network ──► Webhook ──► Relay Service ──► Elasticsearch API
  (Ory Actions)                (transform        (direct index)
                                to ECS)
```

### Event Sources

| Source | Availability | Events | Latency |
|---|---|---|---|
| Live Event Streams | Enterprise plans | All identity events | Near real-time |
| Ory Actions Webhooks | All plans | Triggered on specific flows | Real-time |

## Event Mapping — Ory Events to ECS

### Elastic Common Schema (ECS) Mapping

Ory events map to [ECS field sets](https://www.elastic.co/guide/en/ecs/current/ecs-field-reference.html):

| ECS Field | Ory Event Field | Description |
|---|---|---|
| `@timestamp` | Event timestamp | When the event occurred |
| `event.kind` | `"event"` | ECS event kind |
| `event.category` | `["authentication"]` | ECS event category |
| `event.type` | `["start"]` / `["end"]` | ECS event type |
| `event.action` | Ory event type | e.g., `login.succeeded` |
| `event.outcome` | Derived | `success` or `failure` |
| `event.provider` | `"ory_network"` | Event source |
| `event.module` | `"ory"` | Module name |
| `source.ip` | `event.client_ip` | Client IP |
| `source.geo.*` | GeoIP lookup | Client geolocation |
| `user.id` | `identity.id` | Ory identity ID |
| `user.email` | `identity.traits.email` | User email |
| `user.name` | `identity.traits.username` | Username |
| `user_agent.original` | `event.user_agent` | Raw user agent |
| `ory.project_id` | Project ID | Ory project identifier |
| `ory.flow_id` | Flow ID | Ory flow identifier |
| `ory.session_id` | Session ID | Ory session identifier |
| `ory.aal` | AAL | Authenticator assurance level |
| `ory.method` | Auth method | `password`, `oidc`, `webauthn`, etc. |

### Ory Event Types to ECS Outcome

| Ory Event | `event.action` | `event.outcome` | `event.type` |
|---|---|---|---|
| `login.succeeded` | `user-login` | `success` | `["start"]` |
| `login.failed` | `user-login` | `failure` | `["start"]` |
| `registration.succeeded` | `user-registered` | `success` | `["creation"]` |
| `registration.failed` | `user-registered` | `failure` | `["creation"]` |
| `recovery.succeeded` | `password-reset` | `success` | `["change"]` |
| `settings.mfa_enabled` | `mfa-enrollment` | `success` | `["change"]` |
| `settings.mfa_disabled` | `mfa-unenrollment` | `success` | `["change"]` |
| `session.revoked` | `session-revoked` | `success` | `["end"]` |
| `verification.succeeded` | `email-verified` | `success` | `["info"]` |

## Configuration

### 1. Elasticsearch Index Setup

#### Create the Index Template

```json
PUT _index_template/ory-identity-events
{
  "index_patterns": ["ory-identity-events-*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 1,
      "index.lifecycle.name": "ory-events-ilm",
      "index.lifecycle.rollover_alias": "ory-identity-events"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "event": {
          "properties": {
            "kind": { "type": "keyword" },
            "category": { "type": "keyword" },
            "type": { "type": "keyword" },
            "action": { "type": "keyword" },
            "outcome": { "type": "keyword" },
            "provider": { "type": "keyword" },
            "module": { "type": "keyword" }
          }
        },
        "source": {
          "properties": {
            "ip": { "type": "ip" },
            "geo": {
              "properties": {
                "country_name": { "type": "keyword" },
                "city_name": { "type": "keyword" },
                "location": { "type": "geo_point" }
              }
            }
          }
        },
        "user": {
          "properties": {
            "id": { "type": "keyword" },
            "email": { "type": "keyword" },
            "name": { "type": "keyword" }
          }
        },
        "user_agent": {
          "properties": {
            "original": { "type": "text" }
          }
        },
        "ory": {
          "properties": {
            "project_id": { "type": "keyword" },
            "flow_id": { "type": "keyword" },
            "session_id": { "type": "keyword" },
            "aal": { "type": "keyword" },
            "method": { "type": "keyword" }
          }
        }
      }
    }
  }
}
```

#### Create ILM Policy

```json
PUT _ilm/policy/ory-events-ilm
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": {
            "max_size": "10gb",
            "max_age": "7d"
          }
        }
      },
      "warm": {
        "min_age": "30d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 }
        }
      },
      "delete": {
        "min_age": "365d",
        "actions": { "delete": {} }
      }
    }
  }
}
```

### 2. Logstash Pipeline Configuration

```ruby
# logstash/pipelines/ory-events.conf
# Logstash pipeline for Ory Network identity events -> ECS

input {
  http {
    port => 5044
    codec => json
    additional_codecs => {}
    ssl_enabled => true
    ssl_certificate => "/etc/logstash/certs/logstash.crt"
    ssl_key => "/etc/logstash/certs/logstash.key"
    # Optional: verify webhook source
    # ssl_client_authentication => "required"
  }
}

filter {
  # Set timestamp
  if [timestamp] {
    date {
      match => ["timestamp", "ISO8601"]
      target => "@timestamp"
    }
  }

  # Determine event outcome
  if [error] or [flow_type] =~ /failed/ {
    mutate { add_field => { "[event][outcome]" => "failure" } }
  } else {
    mutate { add_field => { "[event][outcome]" => "success" } }
  }

  # Map to ECS fields
  mutate {
    add_field => {
      "[event][kind]" => "event"
      "[event][category]" => "authentication"
      "[event][provider]" => "ory_network"
      "[event][module]" => "ory"
    }
  }

  # Map event action
  if [flow_type] {
    mutate { add_field => { "[event][action]" => "%{flow_type}" } }
  }

  # Map source IP
  if [request][client_ip] {
    mutate { copy => { "[request][client_ip]" => "[source][ip]" } }
  }

  # Map user fields
  if [identity][id] {
    mutate { copy => { "[identity][id]" => "[user][id]" } }
  }
  if [identity][traits][email] {
    mutate { copy => { "[identity][traits][email]" => "[user][email]" } }
  }

  # Map user agent
  if [request][user_agent] {
    mutate { copy => { "[request][user_agent]" => "[user_agent][original]" } }
    useragent {
      source => "[user_agent][original]"
      target => "[user_agent]"
    }
  }

  # Map Ory-specific fields
  if [project_id] {
    mutate { copy => { "[project_id]" => "[ory][project_id]" } }
  }
  if [flow][id] {
    mutate { copy => { "[flow][id]" => "[ory][flow_id]" } }
  }
  if [session_id] {
    mutate { copy => { "[session_id]" => "[ory][session_id]" } }
  }
  if [authenticator_assurance_level] {
    mutate { copy => { "[authenticator_assurance_level]" => "[ory][aal]" } }
  }
  if [method] {
    mutate { copy => { "[method]" => "[ory][method]" } }
  }

  # GeoIP enrichment
  if [source][ip] {
    geoip {
      source => "[source][ip]"
      target => "[source][geo]"
    }
  }

  # Clean up original fields
  mutate {
    remove_field => [
      "request", "identity", "flow", "project_id",
      "session_id", "authenticator_assurance_level",
      "method", "timestamp", "error", "flow_type"
    ]
  }
}

output {
  elasticsearch {
    hosts => ["https://elasticsearch:9200"]
    index => "ory-identity-events-%{+YYYY.MM.dd}"
    user => "${ES_USER}"
    password => "${ES_PASSWORD}"
    ssl_enabled => true
    ssl_certificate_verification => true
  }

  # Debug output (remove in production)
  # stdout { codec => rubydebug }
}
```

### 3. Ory Actions Webhook Jsonnet Template

```jsonnet
// ory-webhook-elastic.jsonnet
// Formats Ory Actions webhook payloads for Elastic SIEM / ECS ingestion

function(ctx) {
  local identity = if std.objectHas(ctx, "identity") then ctx.identity else {},
  local traits = if std.objectHas(identity, "traits") then identity.traits else {},
  local flow = if std.objectHas(ctx, "flow") then ctx.flow else {},
  local request = if std.objectHas(ctx, "request") then ctx.request else {},

  // Pass through all fields for Logstash to transform
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
  timestamp: std.toString(std.time()),
}
```

### 4. Configure the Ory Action

```bash
ory create action \
  --project $ORY_PROJECT_ID \
  --name "Elastic SIEM Forwarding" \
  --type webhook \
  --trigger after \
  --flows login,registration,recovery,settings,verification \
  --url "https://logstash.example.com:5044" \
  --method POST \
  --body "base64://$(cat ory-webhook-elastic.jsonnet | base64)"
```

### 5. Relay Service for Direct Elasticsearch Ingestion

If you prefer to bypass Logstash and write directly to Elasticsearch:

```javascript
// relay-service/index.mjs — Direct Elasticsearch ingestion
const ES_URL = process.env.ES_URL;         // https://elasticsearch:9200
const ES_API_KEY = process.env.ES_API_KEY;
const INDEX_PREFIX = "ory-identity-events";

export const handler = async (event) => {
  const body = JSON.parse(event.body);
  const isFailure = !!body.error || (body.flow_type && body.flow_type.includes("failed"));

  const doc = {
    "@timestamp": new Date().toISOString(),
    event: {
      kind: "event",
      category: ["authentication"],
      action: body.flow_type || "unknown",
      outcome: isFailure ? "failure" : "success",
      provider: "ory_network",
      module: "ory",
    },
    source: {
      ip: body.request?.client_ip || undefined,
    },
    user: {
      id: body.identity?.id || undefined,
      email: body.identity?.traits?.email || undefined,
      name: body.identity?.traits?.username || undefined,
    },
    user_agent: {
      original: body.request?.user_agent || undefined,
    },
    ory: {
      project_id: body.project_id || "",
      flow_id: body.flow?.id || "",
      session_id: body.session_id || "",
      aal: body.authenticator_assurance_level || "",
      method: body.method || body.flow?.active_method || "",
    },
  };

  const indexName = `${INDEX_PREFIX}-${new Date().toISOString().slice(0, 10)}`;

  const resp = await fetch(`${ES_URL}/${indexName}/_doc`, {
    method: "POST",
    headers: {
      "Authorization": `ApiKey ${ES_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(doc),
  });

  if (!resp.ok) {
    console.error("Elasticsearch error:", resp.status, await resp.text());
    return { statusCode: 502, body: "Failed to index" };
  }

  return { statusCode: 200, body: "OK" };
};
```

## Example Dashboards & Alerts

### Kibana Dashboard JSON (Saved Object)

```json
{
  "type": "dashboard",
  "attributes": {
    "title": "Ory Network - Authentication Overview",
    "description": "Security dashboard for Ory Network identity events",
    "panelsJSON": [
      {
        "title": "Authentication Success vs Failure",
        "type": "visualization",
        "visualization": {
          "type": "lens",
          "config": {
            "index": "ory-identity-events-*",
            "timeField": "@timestamp",
            "metrics": [
              { "type": "count", "splitBy": "event.outcome" }
            ],
            "chartType": "bar_stacked",
            "timeInterval": "1h"
          }
        }
      },
      {
        "title": "Failed Logins by Source IP",
        "type": "visualization",
        "visualization": {
          "type": "lens",
          "config": {
            "index": "ory-identity-events-*",
            "timeField": "@timestamp",
            "filters": [{ "field": "event.outcome", "value": "failure" }],
            "metrics": [
              { "type": "count", "splitBy": "source.ip", "top": 20 }
            ],
            "chartType": "table"
          }
        }
      },
      {
        "title": "Login Geo Map",
        "type": "visualization",
        "visualization": {
          "type": "map",
          "config": {
            "index": "ory-identity-events-*",
            "geoField": "source.geo.location",
            "colorBy": "event.outcome"
          }
        }
      },
      {
        "title": "Authentication Methods",
        "type": "visualization",
        "visualization": {
          "type": "lens",
          "config": {
            "index": "ory-identity-events-*",
            "metrics": [
              { "type": "count", "splitBy": "ory.method" }
            ],
            "chartType": "donut"
          }
        }
      },
      {
        "title": "MFA Adoption (AAL Distribution)",
        "type": "visualization",
        "visualization": {
          "type": "lens",
          "config": {
            "index": "ory-identity-events-*",
            "metrics": [
              { "type": "cardinality", "field": "user.id", "splitBy": "ory.aal" }
            ],
            "chartType": "bar"
          }
        }
      }
    ]
  }
}
```

### KQL / ES|QL Queries

#### Failed Login Rate

```
GET ory-identity-events-*/_search
{
  "query": {
    "bool": {
      "must": [
        { "term": { "event.outcome": "failure" } },
        { "term": { "event.action": "user-login" } },
        { "range": { "@timestamp": { "gte": "now-24h" } } }
      ]
    }
  },
  "aggs": {
    "failed_by_hour": {
      "date_histogram": { "field": "@timestamp", "fixed_interval": "1h" }
    }
  }
}
```

#### Credential Stuffing Detection

```
GET ory-identity-events-*/_search
{
  "query": {
    "bool": {
      "must": [
        { "term": { "event.outcome": "failure" } },
        { "range": { "@timestamp": { "gte": "now-15m" } } }
      ]
    }
  },
  "aggs": {
    "by_source_ip": {
      "terms": { "field": "source.ip", "min_doc_count": 50 },
      "aggs": {
        "unique_users": {
          "cardinality": { "field": "user.email" }
        }
      }
    }
  }
}
```

#### Impossible Travel (KQL in Kibana)

```kql
event.outcome: "success" AND event.action: "user-login"
```

Then use a Kibana ML job with `rare` analysis on `source.geo.country_name` per `user.id`.

### Elastic Detection Rules

Create detection rules in Kibana Security:

#### Brute Force Rule

```json
{
  "name": "Ory - Brute Force Login Attempt",
  "description": "Detects multiple failed login attempts for a single account",
  "type": "threshold",
  "query": "event.outcome: failure AND event.action: user-login",
  "threshold": {
    "field": ["user.email"],
    "value": 10
  },
  "interval": "5m",
  "severity": "high",
  "risk_score": 73,
  "tags": ["Ory", "Authentication", "Brute Force"]
}
```

#### Credential Stuffing Rule

```json
{
  "name": "Ory - Credential Stuffing Attack",
  "description": "Detects many failed logins from a single IP targeting multiple accounts",
  "type": "threshold",
  "query": "event.outcome: failure AND event.action: user-login",
  "threshold": {
    "field": ["source.ip"],
    "value": 50,
    "cardinality": [{ "field": "user.email", "value": 10 }]
  },
  "interval": "5m",
  "severity": "critical",
  "risk_score": 91,
  "tags": ["Ory", "Authentication", "Credential Stuffing"]
}
```

## Use Cases

### 1. Credential Stuffing Detection

Aggregate failed logins by source IP. Alert when a single IP produces > 50 failures against > 10 distinct accounts within 15 minutes. Cross-reference with threat intel indices.

### 2. Account Takeover Timeline

Use Kibana Timelines (SIEM) to reconstruct the full sequence of events for a compromised account: initial login, password change, MFA modification, data access.

### 3. Geographic Anomaly Detection

Use Elastic ML anomaly detection jobs on `source.geo.country_name` per `user.id` to flag logins from unusual locations.

### 4. Compliance & Audit

Build compliance dashboards showing:
- Total authentication events by outcome
- Account lifecycle events (creation, deletion, modification)
- MFA enrollment rates over time
- Data retention compliance (ILM policy enforcement)

### 5. Correlation with Application Events

Correlate Ory authentication events with application-level events in Elasticsearch (e.g., sensitive data access, admin actions) using `user.id` as the join key.

## Resources

- [Elastic Common Schema (ECS)](https://www.elastic.co/guide/en/ecs/current/index.html)
- [Elastic SIEM Detection Rules](https://www.elastic.co/guide/en/security/current/detection-engine-overview.html)
- [Logstash HTTP Input Plugin](https://www.elastic.co/guide/en/logstash/current/plugins-inputs-http.html)
- [Elasticsearch Index Lifecycle Management](https://www.elastic.co/guide/en/elasticsearch/reference/current/index-lifecycle-management.html)
- [Kibana Dashboard Creation](https://www.elastic.co/guide/en/kibana/current/dashboard.html)
- [Ory Actions Webhooks](https://www.ory.sh/docs/actions/webhooks)
- [Ory Live Event Streams](https://www.ory.sh/docs/actions/live-events)
