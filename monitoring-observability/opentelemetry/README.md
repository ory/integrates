# OpenTelemetry

> **Maintained by:** Ory Engineering

Ory natively supports OpenTelemetry. Self-hosted products (Ory Kratos, Ory Hydra, Ory Keto, Ory Oathkeeper) ship an OTLP exporter and list OpenTelemetry as the recommended tracing backend in the Ory observability docs.

The OTLP exporter carries **traces**. Metrics are exposed separately on each service's Prometheus endpoint and logs are written to stdout — neither is exported over OTLP.

> **Self-hosted only.** Ory Network does not export OTLP telemetry to customer-owned collectors today. Project configuration on Ory Network deliberately excludes operational settings such as `tracing`, `logging`, and `port` — the managed control plane's telemetry stays internal. Use the Ory Console's **Activity** > **Logs & Events** view for Ory Network observability.

**Type:** config (instrumentation — no source code in this directory)
**Docs page:** [ory.com/docs/integrates-with/monitoring-observability/opentelemetry](https://www.ory.com/docs/integrates-with/monitoring-observability/opentelemetry)
- [Self-hosted distributed tracing](https://www.ory.com/docs/self-hosted/operations/tracing) (OpenTelemetry is the recommended backend)
- [Self-hosted observability (Prometheus metrics)](https://www.ory.com/docs/self-hosted/operations/observability)
- [Kratos tracing guide](https://www.ory.com/docs/kratos/guides/tracing)

## Self-hosted Ory — native OTLP exporter

Each Ory product reads its exporter settings from the `tracing` configuration, which you can set with environment variables to ship traces directly to a collector or backend:

```bash
TRACING_PROVIDER=otel
TRACING_PROVIDERS_OTLP_SERVER_URL=otel-collector.example.com:4318
TRACING_PROVIDERS_OTLP_INSECURE=true
TRACING_SERVICE_NAME=ory-kratos                 # or ory-hydra / ory-keto / ory-oathkeeper
TRACING_DEPLOYMENT_ENVIRONMENT=production
OTEL_RESOURCE_ATTRIBUTES=service.namespace=identity
TRACING_PROVIDERS_OTLP_SAMPLING_SAMPLING_RATIO=1.0   # tune in production
```

- `TRACING_PROVIDER` accepts `otel`, `jaeger`, or `zipkin`. Use `otel` for OTLP.
- The exporter sends OTLP over HTTP only, so point `TRACING_PROVIDERS_OTLP_SERVER_URL` at the collector's OTLP/HTTP port, 4318 by default. The value is a host and port without a scheme.
- Ory connects over HTTPS. Set `TRACING_PROVIDERS_OTLP_INSECURE=true` only for a collector that accepts plain HTTP.
- Ory ignores `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME`.
- Ory merges `OTEL_RESOURCE_ATTRIBUTES` into its resource, but `service.name` and `deployment.environment.name` always come from `TRACING_SERVICE_NAME` and `TRACING_DEPLOYMENT_ENVIRONMENT`.
- Ory applies `OTEL_EXPORTER_OTLP_HEADERS` unless `TRACING_PROVIDERS_OTLP_AUTHORIZATION_HEADER` is set, which replaces those headers.

## Recommended pipeline

For production, run an OpenTelemetry Collector in front of your final backend:

```
Ory  ─OTLP─▶  OTel Collector  ─export─▶  Tempo / Datadog / New Relic / Honeycomb / ...
                  (batch, retry, sample, redact)
```

The collector handles batching, retries, sampling, and PII redaction in one place — letting you swap backends without touching the Ory configuration.

## License

Apache-2.0. (Configuration / instrumentation — no source code in this directory.)
