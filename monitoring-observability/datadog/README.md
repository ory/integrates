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

1. **Datadog Agent OTLP receiver** (recommended). Run the agent with `otlp_config.receiver.protocols.{grpc,http}` enabled (ports 4317 / 4318) and point Ory's OTLP exporter at it.
2. **Datadog OTLP intake** (agentless). Ship straight to Datadog with `DD-API-KEY` header — endpoints per region:

| Region | OTLP gRPC | OTLP HTTP |
| --- | --- | --- |
| US1 | `otlp.datadoghq.com:4317` | `otlp.datadoghq.com:4318` |
| US3 | `otlp.us3.datadoghq.com:4317` | `otlp.us3.datadoghq.com:4318` |
| US5 | `otlp.us5.datadoghq.com:4317` | `otlp.us5.datadoghq.com:4318` |
| EU | `otlp.datadoghq.eu:4317` | `otlp.datadoghq.eu:4318` |

For Prometheus metrics, the Datadog Agent's OpenMetrics check can scrape `/metrics/prometheus` on each Ory service.

## License

Apache-2.0. (Configuration / instrumentation — no source code in this directory.)
