# Datadog

> **Maintained by:** Ory Engineering

Monitor Ory in Datadog. Self-hosted Ory products (Kratos, Hydra, Keto, Oathkeeper) **natively support Datadog as a tracing backend** — listed alongside OpenTelemetry, Jaeger, Elastic APM, Zipkin, and Instana in the Ory observability docs. Ory Network customers ingest Datadog via OpenTelemetry (OTLP) export.

**Type:** config (instrumentation — no source code in this directory)
**Docs page:**
- [Self-hosted distributed tracing](https://www.ory.com/docs/self-hosted/operations/tracing) (lists Datadog as a first-class tracing backend)
- [Self-hosted observability (Prometheus metrics)](https://www.ory.com/docs/self-hosted/operations/observability)

## Two paths

### Self-hosted Ory — native Datadog tracer

Configure each Ory product to emit traces directly to a Datadog agent via the native Datadog tracing backend (no OTLP collector required). Per the Ory docs, set the tracing provider to `datadog` and point at the agent's APM endpoint (typically `localhost:8126`).

### Ory Network (managed) — OTLP

Ory Network exports telemetry over OTLP. Two ingestion paths:

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
