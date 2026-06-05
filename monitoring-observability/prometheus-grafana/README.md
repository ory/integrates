# Prometheus + Grafana

> **Maintained by:** Ory Engineering

Every Ory service exposes a Prometheus-compatible metrics endpoint at `/metrics/prometheus`. Documented in the Ory self-hosted observability docs as the recommended metrics path.

**Type:** config (scrape + dashboard — no source code in this directory)
**Docs page:** [ory.com/docs/integrates-with/monitoring-observability/prometheus-grafana](https://www.ory.com/docs/integrates-with/monitoring-observability/prometheus-grafana)

| Service | Default metrics endpoint |
| --- | --- |
| Kratos | `http://{host}:4434/metrics/prometheus` (admin port) |
| Hydra | `http://{host}:4445/admin/metrics/prometheus` |
| Keto | `http://{host}:4468/metrics/prometheus` |
| Oathkeeper | `http://{host}:9000/metrics/prometheus` |

## Scrape config

Self-hosted Ory:

```yaml
scrape_configs:
  - job_name: ory-kratos
    metrics_path: /metrics/prometheus
    static_configs: [{ targets: ['kratos-admin:4434'] }]
  - job_name: ory-hydra
    metrics_path: /admin/metrics/prometheus
    static_configs: [{ targets: ['hydra-admin:4445'] }]
```

Ory Network:

```yaml
scrape_configs:
  - job_name: ory-network
    scheme: https
    metrics_path: /metrics/prometheus
    scrape_interval: 30s
    static_configs:
      - targets: ['<your-project>.projects.oryapis.com']
        labels:
          environment: production
```

## Dashboards

There's no officially published Grafana dashboard JSON for Ory. Build your own around the standard Go runtime metrics (`go_*`, `process_*`) plus Ory's HTTP request metrics for the public API paths most relevant to your product (login, registration, verification, OAuth2 token, sessions).

For richer signals, pair with [`opentelemetry`](../opentelemetry/) for traces and a backend like Tempo.

## License

Apache-2.0. (Configuration / instrumentation — no source code in this directory.)
