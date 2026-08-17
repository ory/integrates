# OpenTelemetry

> **Maintained by:** Ory Engineering

Ory natively supports OpenTelemetry. Self-hosted products (Kratos, Hydra, Keto, Oathkeeper) ship an OTLP exporter and list OpenTelemetry as the recommended tracing backend in the Ory observability docs.

> **Self-hosted only.** Ory Network does not export OTLP telemetry to customer-owned collectors today. Project configuration on Ory Network deliberately excludes operational settings such as `tracing`, `logging`, and `port` — the managed control plane's telemetry stays internal. Use the Ory Console's built-in activity and event views for Network observability.

**Type:** config (instrumentation — no source code in this directory)
**Docs page:** [ory.com/docs/integrates-with/monitoring-observability/opentelemetry](https://www.ory.com/docs/integrates-with/monitoring-observability/opentelemetry)
- [Self-hosted distributed tracing](https://www.ory.com/docs/self-hosted/operations/tracing) (OpenTelemetry is the recommended backend)
- [Self-hosted observability (Prometheus metrics)](https://www.ory.com/docs/self-hosted/operations/observability)
- [Kratos tracing guide](https://www.ory.com/docs/kratos/guides/tracing)

## Self-hosted Ory — native OTLP exporter

Each Ory product accepts standard OTel environment variables to ship traces directly to a collector or backend:

```bash
TRACING_PROVIDER=otel
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com:4318
OTEL_SERVICE_NAME=ory-kratos                    # or hydra/keto/oathkeeper
OTEL_RESOURCE_ATTRIBUTES=service.namespace=identity,deployment.environment=production
TRACING_PROVIDERS_OTLP_SAMPLING_SAMPLING_RATIO=1.0   # tune in production
```

`TRACING_PROVIDER` accepts `otel`, `jaeger`, or `zipkin`. Use `otel` for OTLP.

## Recommended pipeline

For production, run an OpenTelemetry Collector in front of your final backend:

```
Ory  ─OTLP─▶  OTel Collector  ─export─▶  Tempo / Datadog / New Relic / Honeycomb / ...
                  (batch, retry, sample, redact)
```

The collector handles batching, retries, sampling, and PII redaction in one place — letting you swap backends without touching the Ory configuration.

## License

Apache-2.0. (Configuration / instrumentation — no source code in this directory.)
