# Datadog

> **Maintained by:** Ory Engineering

Monitor self-hosted Ory in Datadog over OpenTelemetry. Ory's tracer emits OTLP; Datadog ingests it either through the Datadog Agent's OTLP receiver or through Datadog's agentless OTLP intake.

**Type:** config (instrumentation — no source code in this directory)
**Docs page:** [ory.com/docs/integrates-with/monitoring-observability/datadog](https://www.ory.com/docs/integrates-with/monitoring-observability/datadog)
- [Self-hosted distributed tracing](https://www.ory.com/docs/self-hosted/operations/tracing)
- [Self-hosted observability (Prometheus metrics)](https://www.ory.com/docs/self-hosted/operations/observability)

> **There is no `datadog` tracing provider.** `TRACING_PROVIDER` accepts `otel`, `jaeger`, or `zipkin` only — reach Datadog via OTLP (`TRACING_PROVIDER=otel`), not a native Datadog tracer. Ory's span helper does set Datadog-convention error attributes (`error.message`, `error.stack`, `error.type`), so traces arriving over OTLP render correctly in Datadog APM.

> **Self-hosted only.** Ory Network does not export telemetry to customer-owned collectors — managed project config excludes operational settings such as `tracing` and `logging`.

## Ingestion paths

Ory's exporter sends OTLP over HTTP only. It can't use gRPC endpoints on port 4317.

1. **Datadog Agent OTLP receiver** (recommended). Enable the agent's OTLP HTTP receiver (`otlp_config.receiver.protocols.http`, port 4318) and point Ory's exporter at it:

   ```bash
   TRACING_PROVIDER=otel
   TRACING_PROVIDERS_OTLP_SERVER_URL=datadog-agent:4318
   TRACING_PROVIDERS_OTLP_INSECURE=true
   ```

2. **Datadog OTLP intake** (agentless). Send traces straight to Datadog over HTTPS on port 443 with the `dd-api-key` header:

   ```bash
   TRACING_PROVIDER=otel
   TRACING_PROVIDERS_OTLP_SERVER_URL=otlp.datadoghq.com:443
   OTEL_EXPORTER_OTLP_HEADERS=dd-api-key=${DD_API_KEY},compute_stats=true
   ```

   `compute_stats=true` turns on trace metrics, which the intake doesn't compute by default. Endpoints per region:

| Region | `TRACING_PROVIDERS_OTLP_SERVER_URL` |
| --- | --- |
| US1 | `otlp.datadoghq.com:443` |
| US3 | `otlp.us3.datadoghq.com:443` |
| US5 | `otlp.us5.datadoghq.com:443` |
| EU | `otlp.datadoghq.eu:443` |

`TRACING_PROVIDERS_OTLP_SERVER_URL` takes a host and port without a scheme. Set `TRACING_SERVICE_NAME` per service (for example `ory-kratos`); Ory ignores `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME`.

For Prometheus metrics, the Datadog Agent's OpenMetrics check can scrape `/metrics/prometheus` on each Ory service.

## License

Apache-2.0. (Configuration / instrumentation — no source code in this directory.)
