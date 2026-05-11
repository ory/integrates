# OpenTelemetry Integration for Ory Network

Configure Ory Network's native OpenTelemetry (OTLP) export for traces, metrics, and logs. Includes OpenTelemetry Collector configuration, pipeline setup, and downstream backend integration.

**Platform:** Ory Network (managed cloud)

---

## Overview

Ory Network natively supports OpenTelemetry Protocol (OTLP) export for telemetry data. This integration covers:

1. Configuring Ory Network to export telemetry.
2. Setting up an OpenTelemetry Collector to receive, process, and export data.
3. Routing telemetry to backends (Jaeger, Grafana Tempo, DataDog, New Relic, etc.).

**Architecture:**

```
Ory Network  --OTLP-->  OTel Collector  --export-->  Backend(s)
  (traces)                 (receive)                  (Jaeger, Tempo,
  (metrics)                (process)                   DataDog, etc.)
  (logs)                   (export)
```

---

## Configuring Ory Network Telemetry Export

### Via Ory Console

1. Navigate to your project in the Ory Console.
2. Go to **Project Settings > Telemetry** (or **Observability**).
3. Enable **OpenTelemetry Export**.
4. Configure the OTLP endpoint (your Collector's public endpoint).
5. Set the protocol: `grpc` (port 4317) or `http/protobuf` (port 4318).
6. Add any required authentication headers.

### Via Ory CLI

```bash
ory patch project YOUR_PROJECT_ID \
  --replace '/services/identity/config/serve/public/telemetry/otlp/endpoint="https://your-collector.example.com:4317"' \
  --replace '/services/identity/config/serve/public/telemetry/otlp/protocol="grpc"'
```

---

## OpenTelemetry Collector Configuration

### Full Collector Config

Save as `otel-collector-config.yaml`:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  # Batch processor to reduce export calls
  batch:
    timeout: 10s
    send_batch_size: 1024
    send_batch_max_size: 2048

  # Memory limiter to prevent OOM
  memory_limiter:
    check_interval: 5s
    limit_mib: 512
    spike_limit_mib: 128

  # Add resource attributes
  resource:
    attributes:
      - key: service.name
        value: ory-network
        action: upsert
      - key: deployment.environment
        value: production
        action: upsert

  # Filter out noisy or irrelevant spans
  filter:
    traces:
      span:
        - 'attributes["http.target"] == "/health/alive"'
        - 'attributes["http.target"] == "/health/ready"'

exporters:
  # Jaeger (for traces)
  otlp/jaeger:
    endpoint: jaeger-collector.observability.svc:4317
    tls:
      insecure: true

  # Prometheus (for metrics)
  prometheus:
    endpoint: 0.0.0.0:8889
    namespace: ory
    resource_to_telemetry_conversion:
      enabled: true

  # Grafana Tempo (for traces)
  otlp/tempo:
    endpoint: tempo.observability.svc:4317
    tls:
      insecure: true

  # DataDog
  datadog:
    api:
      key: "${DD_API_KEY}"
      site: datadoghq.com

  # Generic OTLP (e.g., New Relic, Honeycomb, Lightstep)
  otlp/generic:
    endpoint: https://otlp.vendor.example.com:4317
    headers:
      api-key: "${VENDOR_API_KEY}"

  # Logging (for debugging)
  logging:
    loglevel: info

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, resource, filter, batch]
      exporters: [otlp/jaeger, logging]

    metrics:
      receivers: [otlp]
      processors: [memory_limiter, resource, batch]
      exporters: [prometheus, logging]

    logs:
      receivers: [otlp]
      processors: [memory_limiter, resource, batch]
      exporters: [logging]

  telemetry:
    logs:
      level: info
    metrics:
      address: 0.0.0.0:8888
```

---

## Pipeline Configurations by Use Case

### Traces Only (Jaeger)

```yaml
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp/jaeger]
```

### Metrics Only (Prometheus)

```yaml
service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
```

### Full Stack (Traces + Metrics + Logs)

```yaml
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, resource, filter, batch]
      exporters: [otlp/tempo]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, resource, batch]
      exporters: [prometheus]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, resource, batch]
      exporters: [logging]
```

---

## Deploying the Collector

### Docker

```bash
docker run -d \
  --name otel-collector \
  -p 4317:4317 \
  -p 4318:4318 \
  -p 8888:8888 \
  -p 8889:8889 \
  -v $(pwd)/otel-collector-config.yaml:/etc/otelcol/config.yaml \
  otel/opentelemetry-collector-contrib:latest
```

### Kubernetes (Helm)

```bash
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts

helm install otel-collector open-telemetry/opentelemetry-collector \
  --set mode=deployment \
  --set config="$(cat otel-collector-config.yaml)" \
  --namespace observability \
  --create-namespace
```

### Kubernetes Manifest (Abbreviated)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: otel-collector
  namespace: observability
spec:
  replicas: 2
  selector:
    matchLabels:
      app: otel-collector
  template:
    metadata:
      labels:
        app: otel-collector
    spec:
      containers:
        - name: otel-collector
          image: otel/opentelemetry-collector-contrib:latest
          ports:
            - containerPort: 4317  # gRPC
            - containerPort: 4318  # HTTP
            - containerPort: 8888  # Collector metrics
            - containerPort: 8889  # Prometheus exporter
          volumeMounts:
            - name: config
              mountPath: /etc/otelcol/config.yaml
              subPath: config.yaml
      volumes:
        - name: config
          configMap:
            name: otel-collector-config
---
apiVersion: v1
kind: Service
metadata:
  name: otel-collector
  namespace: observability
spec:
  type: ClusterIP
  ports:
    - name: grpc
      port: 4317
    - name: http
      port: 4318
    - name: metrics
      port: 8888
    - name: prometheus
      port: 8889
  selector:
    app: otel-collector
```

---

## Key Ory Metrics to Monitor

### Authentication Metrics

| Metric | Description | Type |
|---|---|---|
| `ory_login_success_total` | Total successful logins | Counter |
| `ory_login_failure_total` | Total failed logins | Counter |
| `ory_registration_success_total` | Total successful registrations | Counter |
| `ory_registration_failure_total` | Total failed registrations | Counter |
| `ory_login_duration_milliseconds` | Login flow latency | Histogram |
| `ory_registration_duration_milliseconds` | Registration flow latency | Histogram |

### Session Metrics

| Metric | Description | Type |
|---|---|---|
| `ory_session_active_count` | Currently active sessions | Gauge |
| `ory_session_issued_total` | Total sessions issued | Counter |
| `ory_session_revoked_total` | Total sessions revoked | Counter |

### MFA Metrics

| Metric | Description | Type |
|---|---|---|
| `ory_mfa_setup_total` | Total MFA enrollments | Counter |
| `ory_mfa_success_total` | Successful MFA verifications | Counter |
| `ory_mfa_failure_total` | Failed MFA verifications | Counter |

### Trace Attributes

Ory traces include these span attributes:

| Attribute | Description |
|---|---|
| `http.method` | HTTP method (GET, POST, etc.) |
| `http.target` | Request path |
| `http.status_code` | Response status code |
| `ory.flow.type` | Flow type (login, registration, settings, etc.) |
| `ory.identity.id` | Identity ID (on authenticated flows) |
| `ory.project.id` | Ory Network project ID |

---

## Example Alert Rules (OpenTelemetry-native)

If your backend supports OpenTelemetry-native alerting, or if you export to Prometheus and use Alertmanager:

```yaml
# Prometheus alert rules (via OTel Collector's Prometheus exporter)
groups:
  - name: ory-otel-alerts
    rules:
      - alert: OryHighLoginFailureRate
        expr: |
          sum(rate(ory_login_failure_total[5m]))
          / (sum(rate(ory_login_success_total[5m])) + sum(rate(ory_login_failure_total[5m])))
          > 0.3
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Login failure rate above 30%"

      - alert: OryHighLatency
        expr: |
          histogram_quantile(0.95,
            sum(rate(ory_login_duration_milliseconds_bucket[5m])) by (le)
          ) > 3000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Login p95 latency exceeds 3s"
```

---

## Backend-Specific Export Configuration

### Grafana Cloud (Tempo + Mimir)

```yaml
exporters:
  otlp/grafana-traces:
    endpoint: tempo-us-central1.grafana.net:443
    headers:
      authorization: "Basic YOUR_BASE64_ENCODED_INSTANCE_ID_AND_TOKEN"

  otlphttp/grafana-metrics:
    endpoint: https://prometheus-us-central1.grafana.net/api/prom/push
    headers:
      authorization: "Basic YOUR_BASE64_ENCODED_INSTANCE_ID_AND_TOKEN"
```

### New Relic

```yaml
exporters:
  otlp/newrelic:
    endpoint: https://otlp.nr-data.net:4317
    headers:
      api-key: YOUR_NEW_RELIC_LICENSE_KEY
```

### Honeycomb

```yaml
exporters:
  otlp/honeycomb:
    endpoint: api.honeycomb.io:443
    headers:
      x-honeycomb-team: YOUR_HONEYCOMB_API_KEY
      x-honeycomb-dataset: ory-network
```

---

## Troubleshooting

| Issue | Resolution |
|---|---|
| Collector not receiving data | Verify Ory Network OTLP endpoint config points to the Collector's public address. Check firewall rules for port 4317/4318. |
| gRPC connection refused | Ensure the Collector's gRPC receiver is bound to `0.0.0.0`, not `localhost`. |
| No traces in backend | Check the Collector logs (`logging` exporter). Verify the pipeline connects receivers to exporters. |
| High memory usage | Tune `memory_limiter` and `batch` processor settings. Reduce `send_batch_max_size`. |
| Missing span attributes | Verify Ory Network telemetry settings include the desired signal types (traces, metrics). |

### Verifying Collector Health

```bash
# Check collector metrics
curl http://localhost:8888/metrics

# Check if the Prometheus exporter is working
curl http://localhost:8889/metrics

# Check collector logs
docker logs otel-collector
```
