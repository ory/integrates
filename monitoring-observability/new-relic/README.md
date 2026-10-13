# New Relic

> **Maintained by:** Community contributors

New Relic ingests OpenTelemetry over OTLP/HTTP. Self-hosted Ory products (Ory Kratos, Ory Hydra, Ory Keto, Ory Oathkeeper) emit OTel traces that New Relic consumes directly. Metrics come from each service's Prometheus endpoint rather than over OTLP — scrape them with New Relic's Prometheus integration.

> **Self-hosted only.** Ory Network does not export telemetry to customer-owned collectors — managed project config excludes operational settings such as `tracing` and `logging`.

**Type:** config (instrumentation — no source code in this directory)
**Docs page:** [ory.com/docs/integrates-with/monitoring-observability/new-relic](https://www.ory.com/docs/integrates-with/monitoring-observability/new-relic)

| Setting | Value |
| --- | --- |
| OTLP endpoint (US) | `otlp.nr-data.net:4318` |
| OTLP endpoint (EU) | `otlp.eu01.nr-data.net:4318` |
| Auth header | `api-key: <new-relic-license-key>` |
| Protocol | OTLP/HTTP (Ory's exporter doesn't support gRPC) |
| Signals | traces (metrics come from the Prometheus endpoint, not OTLP) |

## Setup

Set these environment variables on each service:

```bash
TRACING_PROVIDER=otel
TRACING_PROVIDERS_OTLP_SERVER_URL=otlp.nr-data.net:4318
OTEL_EXPORTER_OTLP_HEADERS=api-key=${NEW_RELIC_LICENSE_KEY}
TRACING_SERVICE_NAME=ory-kratos                     # or ory-hydra / ory-keto / ory-oathkeeper
TRACING_DEPLOYMENT_ENVIRONMENT=production
OTEL_RESOURCE_ATTRIBUTES=service.namespace=identity
TRACING_PROVIDERS_OTLP_SAMPLING_SAMPLING_RATIO=1.0  # tune in production
```

`TRACING_PROVIDERS_OTLP_SERVER_URL` takes a host and port without a scheme, and Ory connects over HTTPS. Ory ignores `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME`, so use the `TRACING_*` variables instead.

For production, prefer running an OpenTelemetry Collector in front so batching, retries, and sampling happen in one place.

## Notes

- New Relic enforces attribute count/size limits — `identity.id` is fine, `identity.traits` as a flat blob is not. Review the [New Relic OTLP attribute limits](https://docs.newrelic.com/docs/more-integrations/open-source-telemetry-integrations/opentelemetry/best-practices/opentelemetry-otlp/) doc before high-cardinality exports.
- Use **Account – Ingest** scope license keys for telemetry — never full user keys.
- Sample at the OTel SDK or collector level, not backend-side, to preserve head-of-trace context.

## License

Apache-2.0. (Configuration / instrumentation — no source code in this directory.)
