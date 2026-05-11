# Prometheus + Grafana Integration for Ory Network

Monitor Ory Network authentication metrics using Prometheus for collection and Grafana for visualization. Includes scrape configuration, PromQL queries, alert rules, and a Grafana dashboard structure.

**Platform:** Ory Network (managed cloud)

---

## Overview

Ory Network exposes a Prometheus-compatible metrics endpoint. Prometheus scrapes this endpoint at a configured interval, and Grafana queries Prometheus to build dashboards and alerts.

**Architecture:**

```
Ory Network  -->  Prometheus  -->  Grafana
  (metrics)       (scrape)        (dashboards & alerts)
```

---

## Prometheus Scrape Configuration

Add the following to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'ory-network'
    scheme: https
    scrape_interval: 30s
    scrape_timeout: 10s
    metrics_path: /metrics/prometheus

    static_configs:
      - targets:
          - 'YOUR_ORY_PROJECT.projects.oryapis.com'
        labels:
          environment: production
          project: your-project-slug

    # If authentication is required for the metrics endpoint
    authorization:
      type: Bearer
      credentials: 'YOUR_ORY_API_KEY'

    # TLS is required for Ory Network endpoints
    tls_config:
      insecure_skip_verify: false
```

### Service Discovery (Kubernetes)

If you run Prometheus in Kubernetes and manage multiple Ory projects:

```yaml
scrape_configs:
  - job_name: 'ory-network'
    scheme: https
    scrape_interval: 30s
    metrics_path: /metrics/prometheus
    file_sd_configs:
      - files:
          - /etc/prometheus/ory-targets.json
        refresh_interval: 5m
```

`/etc/prometheus/ory-targets.json`:

```json
[
  {
    "targets": ["project-a.projects.oryapis.com"],
    "labels": { "project": "project-a", "environment": "production" }
  },
  {
    "targets": ["project-b.projects.oryapis.com"],
    "labels": { "project": "project-b", "environment": "staging" }
  }
]
```

---

## Key Ory Metrics to Monitor

| Metric | Description | Type |
|---|---|---|
| `ory_login_success_total` | Total successful logins | Counter |
| `ory_login_failure_total` | Total failed logins | Counter |
| `ory_registration_success_total` | Total successful registrations | Counter |
| `ory_registration_failure_total` | Total failed registrations | Counter |
| `ory_login_duration_milliseconds` | Login flow latency | Histogram |
| `ory_registration_duration_milliseconds` | Registration flow latency | Histogram |
| `ory_session_active_count` | Currently active sessions | Gauge |
| `ory_session_issued_total` | Total sessions issued | Counter |
| `ory_session_revoked_total` | Total sessions revoked | Counter |
| `ory_mfa_setup_total` | Total MFA enrollments | Counter |
| `ory_mfa_success_total` | Successful MFA verifications | Counter |
| `ory_mfa_failure_total` | Failed MFA verifications | Counter |

---

## Example PromQL Queries

### Login Success Rate (percentage, 5m window)

```promql
sum(rate(ory_login_success_total{environment="production"}[5m]))
/
(
  sum(rate(ory_login_success_total{environment="production"}[5m]))
  +
  sum(rate(ory_login_failure_total{environment="production"}[5m]))
) * 100
```

### Login Failure Rate per Second

```promql
sum(rate(ory_login_failure_total{environment="production"}[5m]))
```

### Registration Rate per Minute

```promql
sum(rate(ory_registration_success_total{environment="production"}[5m])) * 60
```

### Login Latency Percentiles (p50, p95, p99)

```promql
# p50
histogram_quantile(0.50, sum(rate(ory_login_duration_milliseconds_bucket{environment="production"}[5m])) by (le))

# p95
histogram_quantile(0.95, sum(rate(ory_login_duration_milliseconds_bucket{environment="production"}[5m])) by (le))

# p99
histogram_quantile(0.99, sum(rate(ory_login_duration_milliseconds_bucket{environment="production"}[5m])) by (le))
```

### Active Sessions

```promql
ory_session_active_count{environment="production"}
```

### MFA Adoption Rate

```promql
sum(ory_mfa_setup_total{environment="production"})
/
sum(ory_registration_success_total{environment="production"})
```

### Session Turnover (issued minus revoked, rate)

```promql
sum(rate(ory_session_issued_total{environment="production"}[1h]))
-
sum(rate(ory_session_revoked_total{environment="production"}[1h]))
```

---

## Prometheus Alert Rules

Save as `/etc/prometheus/rules/ory-alerts.yml`:

```yaml
groups:
  - name: ory-authentication
    interval: 30s
    rules:
      # High login failure rate
      - alert: OryHighLoginFailureRate
        expr: |
          sum(rate(ory_login_failure_total{environment="production"}[5m]))
          /
          (sum(rate(ory_login_success_total{environment="production"}[5m])) + sum(rate(ory_login_failure_total{environment="production"}[5m])))
          > 0.3
        for: 5m
        labels:
          severity: critical
          service: ory
        annotations:
          summary: "High login failure rate ({{ $value | humanizePercentage }})"
          description: "Login failure rate has exceeded 30% for 5 minutes. Possible credential stuffing or misconfiguration."
          runbook_url: "https://wiki.example.com/runbooks/ory-high-login-failure"

      # Registration spike
      - alert: OryRegistrationSpike
        expr: |
          sum(rate(ory_registration_success_total{environment="production"}[5m])) * 60 > 50
        for: 5m
        labels:
          severity: warning
          service: ory
        annotations:
          summary: "Registration spike detected ({{ $value | humanize }} per minute)"
          description: "Registration rate exceeds 50/min. Possible bot registration."

      # High login latency
      - alert: OryHighLoginLatency
        expr: |
          histogram_quantile(0.95, sum(rate(ory_login_duration_milliseconds_bucket{environment="production"}[5m])) by (le))
          > 3000
        for: 10m
        labels:
          severity: warning
          service: ory
        annotations:
          summary: "High login latency p95 ({{ $value | humanize }}ms)"
          description: "Login p95 latency has exceeded 3 seconds for 10 minutes."

      # MFA failure spike
      - alert: OryMFAFailureSpike
        expr: |
          sum(rate(ory_mfa_failure_total{environment="production"}[5m]))
          /
          (sum(rate(ory_mfa_success_total{environment="production"}[5m])) + sum(rate(ory_mfa_failure_total{environment="production"}[5m])))
          > 0.5
        for: 5m
        labels:
          severity: critical
          service: ory
        annotations:
          summary: "High MFA failure rate ({{ $value | humanizePercentage }})"
          description: "MFA failure rate exceeds 50%. Possible attack on MFA-protected accounts."

      # No login activity (service down?)
      - alert: OryNoLoginActivity
        expr: |
          sum(rate(ory_login_success_total{environment="production"}[15m])) == 0
          and
          sum(rate(ory_login_failure_total{environment="production"}[15m])) == 0
        for: 15m
        labels:
          severity: warning
          service: ory
        annotations:
          summary: "No login activity detected for 15 minutes"
          description: "Neither successful nor failed logins have been recorded. Verify Ory Network connectivity."
```

---

## Grafana Dashboard JSON Structure

Import this into Grafana via **Dashboards > Import > Paste JSON**.

```json
{
  "dashboard": {
    "title": "Ory Authentication Monitoring",
    "tags": ["ory", "authentication", "security"],
    "timezone": "browser",
    "panels": [
      {
        "title": "Login Success Rate (%)",
        "type": "stat",
        "gridPos": { "h": 4, "w": 6, "x": 0, "y": 0 },
        "targets": [
          {
            "expr": "sum(rate(ory_login_success_total{environment=\"production\"}[5m])) / (sum(rate(ory_login_success_total{environment=\"production\"}[5m])) + sum(rate(ory_login_failure_total{environment=\"production\"}[5m]))) * 100",
            "legendFormat": "Success Rate"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "thresholds": {
              "steps": [
                { "value": 0, "color": "red" },
                { "value": 80, "color": "yellow" },
                { "value": 95, "color": "green" }
              ]
            }
          }
        }
      },
      {
        "title": "Active Sessions",
        "type": "stat",
        "gridPos": { "h": 4, "w": 6, "x": 6, "y": 0 },
        "targets": [
          {
            "expr": "ory_session_active_count{environment=\"production\"}",
            "legendFormat": "Sessions"
          }
        ]
      },
      {
        "title": "Registrations (per minute)",
        "type": "stat",
        "gridPos": { "h": 4, "w": 6, "x": 12, "y": 0 },
        "targets": [
          {
            "expr": "sum(rate(ory_registration_success_total{environment=\"production\"}[5m])) * 60",
            "legendFormat": "Registrations/min"
          }
        ]
      },
      {
        "title": "MFA Adoption",
        "type": "gauge",
        "gridPos": { "h": 4, "w": 6, "x": 18, "y": 0 },
        "targets": [
          {
            "expr": "sum(ory_mfa_setup_total{environment=\"production\"}) / sum(ory_registration_success_total{environment=\"production\"}) * 100",
            "legendFormat": "MFA %"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "min": 0,
            "max": 100
          }
        }
      },
      {
        "title": "Login Success vs Failure Rate",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 4 },
        "targets": [
          {
            "expr": "sum(rate(ory_login_success_total{environment=\"production\"}[5m]))",
            "legendFormat": "Success"
          },
          {
            "expr": "sum(rate(ory_login_failure_total{environment=\"production\"}[5m]))",
            "legendFormat": "Failure"
          }
        ]
      },
      {
        "title": "Login Latency Percentiles",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 4 },
        "targets": [
          {
            "expr": "histogram_quantile(0.50, sum(rate(ory_login_duration_milliseconds_bucket{environment=\"production\"}[5m])) by (le))",
            "legendFormat": "p50"
          },
          {
            "expr": "histogram_quantile(0.95, sum(rate(ory_login_duration_milliseconds_bucket{environment=\"production\"}[5m])) by (le))",
            "legendFormat": "p95"
          },
          {
            "expr": "histogram_quantile(0.99, sum(rate(ory_login_duration_milliseconds_bucket{environment=\"production\"}[5m])) by (le))",
            "legendFormat": "p99"
          }
        ],
        "fieldConfig": {
          "defaults": { "unit": "ms" }
        }
      },
      {
        "title": "Session Issuance vs Revocation",
        "type": "timeseries",
        "gridPos": { "h": 8, "w": 24, "x": 0, "y": 12 },
        "targets": [
          {
            "expr": "sum(rate(ory_session_issued_total{environment=\"production\"}[5m]))",
            "legendFormat": "Issued"
          },
          {
            "expr": "sum(rate(ory_session_revoked_total{environment=\"production\"}[5m]))",
            "legendFormat": "Revoked"
          }
        ]
      }
    ],
    "time": { "from": "now-24h", "to": "now" },
    "refresh": "30s"
  }
}
```

---

## Troubleshooting

| Issue | Resolution |
|---|---|
| Prometheus `context deadline exceeded` | Increase `scrape_timeout` or check network connectivity to Ory Network. |
| No data in Grafana | Verify Prometheus data source is configured. Check that Prometheus is scraping successfully (`Status > Targets`). |
| Histogram quantiles returning `NaN` | Ensure there is recent data in the histogram buckets. No traffic means no latency data. |
| Alert not firing | Check `for` duration; the condition must be true continuously for that period. |
