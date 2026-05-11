# DataDog Integration for Ory Network

Monitor Ory Network authentication metrics in DataDog using OpenTelemetry (OTLP) export and Prometheus-format metrics scraping. Includes dashboard concepts and alert rules for critical authentication metrics.

**Platform:** Ory Network (managed cloud)

---

## Overview

Ory Network exposes metrics in both OpenTelemetry (OTLP) and Prometheus formats. DataDog can ingest these metrics via:

1. **OTLP Exporter** — Ory Network exports telemetry data directly to the DataDog OTLP endpoint via the DataDog Agent or the DataDog OTLP intake.
2. **DataDog Agent** — The agent scrapes Ory's Prometheus-compatible metrics endpoint.

---

## Option 1: OTLP Export (Recommended)

### Ory Network Telemetry Configuration

Configure Ory Network to export telemetry via OTLP. In the Ory Console:

1. Go to **Project Settings > Telemetry**.
2. Enable **OpenTelemetry Export**.
3. Set the OTLP endpoint to your DataDog intake or DataDog Agent.

### DataDog Agent OTLP Configuration

Configure the DataDog Agent to receive OTLP data:

```yaml
# /etc/datadog-agent/datadog.yaml

otlp_config:
  receiver:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

# Enable logs collection if you also want Ory logs
logs_enabled: true
```

### Direct OTLP to DataDog Intake (Agentless)

If you prefer not to run a DataDog Agent, configure Ory Network to send OTLP data directly to DataDog's intake:

| Region | OTLP gRPC Endpoint | OTLP HTTP Endpoint |
|---|---|---|
| US1 | `https://otlp.datadoghq.com:4317` | `https://otlp.datadoghq.com:4318` |
| US3 | `https://otlp.us3.datadoghq.com:4317` | `https://otlp.us3.datadoghq.com:4318` |
| US5 | `https://otlp.us5.datadoghq.com:4317` | `https://otlp.us5.datadoghq.com:4318` |
| EU | `https://otlp.datadoghq.eu:4317` | `https://otlp.datadoghq.eu:4318` |

Required headers for direct intake:

```
DD-API-KEY: YOUR_DATADOG_API_KEY
```

---

## Option 2: Prometheus Metrics Scraping

### DataDog Agent Prometheus Check Configuration

```yaml
# /etc/datadog-agent/conf.d/openmetrics.d/conf.yaml

instances:
  - openmetrics_endpoint: https://YOUR_ORY_PROJECT.projects.oryapis.com/metrics/prometheus
    namespace: ory
    metrics:
      - ory_*
    # If your Ory metrics endpoint requires authentication
    headers:
      Authorization: "Bearer YOUR_ORY_API_KEY"
    tags:
      - env:production
      - service:ory-network
      - project:YOUR_PROJECT_SLUG
```

---

## Key Ory Metrics to Monitor

### Authentication Metrics

| Metric | Description | Type |
|---|---|---|
| `ory.login.success.total` | Total successful logins | Counter |
| `ory.login.failure.total` | Total failed logins | Counter |
| `ory.registration.success.total` | Total successful registrations | Counter |
| `ory.registration.failure.total` | Total failed registrations | Counter |
| `ory.login.duration.milliseconds` | Login flow latency | Histogram |
| `ory.registration.duration.milliseconds` | Registration flow latency | Histogram |

### Session Metrics

| Metric | Description | Type |
|---|---|---|
| `ory.session.active.count` | Currently active sessions | Gauge |
| `ory.session.issued.total` | Total sessions issued | Counter |
| `ory.session.revoked.total` | Total sessions revoked | Counter |

### MFA Metrics

| Metric | Description | Type |
|---|---|---|
| `ory.mfa.setup.total` | Total MFA enrollments | Counter |
| `ory.mfa.success.total` | Total successful MFA verifications | Counter |
| `ory.mfa.failure.total` | Total failed MFA verifications | Counter |
| `ory.mfa.adoption.ratio` | Ratio of identities with MFA enabled | Gauge |

### API Latency

| Metric | Description | Type |
|---|---|---|
| `ory.http.request.duration.p50` | 50th percentile request latency | Summary |
| `ory.http.request.duration.p95` | 95th percentile request latency | Summary |
| `ory.http.request.duration.p99` | 99th percentile request latency | Summary |

---

## Example DataDog Alert Rules

### High Login Failure Rate

```json
{
  "name": "Ory - High Login Failure Rate",
  "type": "metric alert",
  "query": "sum(last_5m):sum:ory.login.failure.total{env:production}.as_rate() / (sum:ory.login.success.total{env:production}.as_rate() + sum:ory.login.failure.total{env:production}.as_rate()) > 0.3",
  "message": "Login failure rate exceeds 30% over the last 5 minutes.\n\nThis may indicate:\n- Credential stuffing attack\n- Password database compromise\n- Application misconfiguration\n\n@pagerduty-ory-alerts",
  "tags": ["service:ory", "env:production"],
  "options": {
    "thresholds": {
      "critical": 0.3,
      "warning": 0.15
    },
    "notify_no_data": false,
    "evaluation_delay": 60
  }
}
```

### Registration Spike (Possible Bot Attack)

```json
{
  "name": "Ory - Registration Spike",
  "type": "metric alert",
  "query": "sum(last_5m):sum:ory.registration.success.total{env:production}.as_rate() > 100",
  "message": "Registration rate exceeds 100 per 5 minutes.\n\nPossible bot registration attack.\n\n@slack-security-alerts",
  "tags": ["service:ory", "env:production"],
  "options": {
    "thresholds": {
      "critical": 100,
      "warning": 50
    }
  }
}
```

### High Login Latency

```json
{
  "name": "Ory - High Login Latency (p95)",
  "type": "metric alert",
  "query": "avg(last_10m):avg:ory.login.duration.milliseconds.95percentile{env:production} > 3000",
  "message": "Login p95 latency exceeds 3 seconds.\n\nCheck Ory Network status and downstream webhook performance.\n\n@slack-platform-alerts",
  "tags": ["service:ory", "env:production"],
  "options": {
    "thresholds": {
      "critical": 3000,
      "warning": 2000
    }
  }
}
```

### MFA Adoption Below Target

```json
{
  "name": "Ory - MFA Adoption Below Target",
  "type": "metric alert",
  "query": "avg(last_1h):avg:ory.mfa.adoption.ratio{env:production} < 0.5",
  "message": "MFA adoption rate is below 50%.\n\nConsider enabling MFA enforcement or sending adoption nudges.\n\n@slack-security-alerts",
  "tags": ["service:ory", "env:production"],
  "options": {
    "thresholds": {
      "critical": 0.3,
      "warning": 0.5
    }
  }
}
```

---

## Example Dashboard Concept

### Ory Authentication Dashboard — Widget Layout

```
+---------------------------------------------------+
|  Ory Authentication Overview                       |
+---------------------------+-----------------------+
|  Login Success Rate       |  Registration Rate    |
|  (timeseries, 24h)       |  (timeseries, 24h)   |
+---------------------------+-----------------------+
|  Login Failures           |  Failed Login by      |
|  (top list, last 1h)     |  Error Type (pie)     |
+---------------------------+-----------------------+
|  Login Latency p50/p95/p99                        |
|  (timeseries, 24h, overlay)                       |
+---------------------------------------------------+
|  Active Sessions          |  MFA Adoption Rate    |
|  (query value, current)  |  (gauge, percentage)  |
+---------------------------+-----------------------+
|  Session Issuance vs Revocation                   |
|  (timeseries, 7d)                                 |
+---------------------------------------------------+
```

### DataDog Dashboard JSON Structure (Abbreviated)

```json
{
  "title": "Ory Authentication Dashboard",
  "widgets": [
    {
      "definition": {
        "type": "timeseries",
        "title": "Login Success vs Failure Rate",
        "requests": [
          {
            "q": "sum:ory.login.success.total{env:production}.as_rate()",
            "display_type": "line",
            "style": { "palette": "green" }
          },
          {
            "q": "sum:ory.login.failure.total{env:production}.as_rate()",
            "display_type": "line",
            "style": { "palette": "red" }
          }
        ]
      }
    },
    {
      "definition": {
        "type": "query_value",
        "title": "Active Sessions",
        "requests": [
          {
            "q": "avg:ory.session.active.count{env:production}",
            "aggregator": "last"
          }
        ]
      }
    },
    {
      "definition": {
        "type": "timeseries",
        "title": "Login Latency Percentiles",
        "requests": [
          { "q": "avg:ory.login.duration.milliseconds.median{env:production}", "display_type": "line" },
          { "q": "avg:ory.login.duration.milliseconds.95percentile{env:production}", "display_type": "line" },
          { "q": "avg:ory.login.duration.milliseconds.99percentile{env:production}", "display_type": "line" }
        ]
      }
    }
  ],
  "layout_type": "ordered"
}
```

---

## Troubleshooting

| Issue | Resolution |
|---|---|
| No metrics in DataDog | Verify the DataDog Agent is running and OTLP receiver is enabled. Check agent status with `datadog-agent status`. |
| Metrics have wrong namespace | Ensure the `namespace: ory` is set in the OpenMetrics check config. |
| Missing API key error | Set `DD_API_KEY` environment variable or configure in `datadog.yaml`. |
| High cardinality warnings | Limit tag values in the Ory metrics config to avoid metric explosion. |
