# OpenTelemetry

> **Maintained by:** Ory Engineering

Ory natively supports OpenTelemetry. Self-hosted products list it as the first supported tracing backend in the Ory observability docs; Ory Network exports OTLP for traces, metrics, and logs.

**Type:** config (instrumentation — no source code in this directory)
**Docs page:** [ory.com/docs/integrates-with/monitoring-observability/opentelemetry](https://www.ory.com/docs/integrates-with/monitoring-observability/opentelemetry)
- [Self-hosted distributed tracing](https://www.ory.com/docs/self-hosted/operations/tracing) (OpenTelemetry is the recommended backend)
- [Self-hosted observability (Prometheus metrics)](https://www.ory.com/docs/self-hosted/operations/observability)
- [Kratos tracing guide](https://www.ory.com/docs/kratos/guides/tracing)

## Two paths

### Self-hosted Ory — native OTLP exporter

Each Ory product accepts standard OTel environment variables to ship traces directly to a collector or backend:

```bash
TRACING_PROVIDER=otel
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com:4318
OTEL_SERVICE_NAME=ory-kratos                    # or hydra/keto/oathkeeper
OTEL_RESOURCE_ATTRIBUTES=service.namespace=identity,deployment.environment=production
TRACING_PROVIDERS_OTLP_SAMPLING_SAMPLING_RATIO=1.0   # tune in production
```

### Ory Network (managed) — OTLP export

Ory Network exports OTLP from the managed control plane. In the Ory Console under **Project Settings → Telemetry**, set the OTLP endpoint (your collector's public address), pick `grpc` (4317) or `http/protobuf` (4318), and add any auth headers your collector requires.

## Recommended pipeline

For production, run an OpenTelemetry Collector in front of your final backend:

```
Ory  ─OTLP─▶  OTel Collector  ─export─▶  Tempo / Datadog / New Relic / Honeycomb / ...
                  (batch, retry, sample, redact)
```

The collector handles batching, retries, sampling, and PII redaction in one place — letting you swap backends without touching the Ory configuration.

## License

Apache-2.0. (Configuration / instrumentation — no source code in this directory.)
