# New Relic — Ory Network Integration

> **Maintained by:** Ory Engineering

## Overview

New Relic is a full-stack observability platform that natively ingests OpenTelemetry data over OTLP/HTTP. Self-hosted Ory products (Kratos, Hydra, Keto, Oathkeeper) and Ory Network self-managed deployments emit OpenTelemetry traces, metrics, and logs that New Relic can consume directly, giving customers a single pane of glass for identity-flow performance, error rates, and downstream impact.

## How it works

```
Ory Kratos / Hydra / Keto / Oathkeeper
  └─ OpenTelemetry exporter (OTLP/HTTP) → New Relic OTLP endpoint
                                                  ↓
                                         New Relic UI: traces, metrics, logs
```

New Relic provides a managed OTLP endpoint per region (US / EU). Authentication is via a New Relic license key (also called an "ingest key") passed in a header.

## Prerequisites

1. **New Relic account** at [newrelic.com](https://newrelic.com/) (free tier covers basic ingest).
2. **License key** (Ingest – License) generated under **Account Settings → API keys**.
3. **Self-hosted Ory products** (Kratos / Hydra / Keto / Oathkeeper). Ory Network's managed cloud already exports its own telemetry — this integration applies to self-hosted deployments and to your application code calling Ory APIs.

## Configuration

Set the OTel exporter environment variables on each Ory service:

```bash
# US datacenter
OTEL_EXPORTER_OTLP_ENDPOINT="https://otlp.nr-data.net:4318"
# (or for EU: "https://otlp.eu01.nr-data.net:4318")
OTEL_EXPORTER_OTLP_HEADERS="api-key=<your-new-relic-license-key>"
OTEL_SERVICE_NAME="ory-kratos"            # or ory-hydra, ory-keto, ory-oathkeeper
OTEL_RESOURCE_ATTRIBUTES="service.namespace=identity,deployment.environment=production"
TRACING_PROVIDER="otel"
TRACING_PROVIDERS_OTLP_INSECURE="false"
TRACING_PROVIDERS_OTLP_SAMPLING_SAMPLING_RATIO="1.0"   # tune in production
```

If you also want logs and metrics in New Relic alongside traces, run an OpenTelemetry Collector with the OTLP/HTTP exporter pointing at the same endpoint. The collector pattern is the recommended path for production — it handles batching, retries, and per-signal sampling.

## Technical details

| Field | Value |
|---|---|
| OTLP endpoint (US) | `https://otlp.nr-data.net:4318` |
| OTLP endpoint (EU) | `https://otlp.eu01.nr-data.net:4318` |
| Auth header | `api-key: <new-relic-license-key>` |
| Protocols | OTLP/HTTP (recommended), OTLP/gRPC also supported |
| Signals | traces, metrics, logs |

## Notes

- New Relic has limits on attribute count and size — review their OTLP attribute-limits doc before exporting high-cardinality identity attributes (e.g., `identity.id` is fine; `identity.traits` as a flat blob is not).
- License keys are tied to an account. Use ingest keys with **Account – Ingest** scope only; do not use full user keys for telemetry.
- If you are sampling, sample at the OTel SDK or collector level — don't rely on New Relic-side sampling because it loses head-of-trace context.

## Resources

- [New Relic OpenTelemetry quick start](https://docs.newrelic.com/docs/more-integrations/open-source-telemetry-integrations/opentelemetry/get-started/opentelemetry-set-up-your-app/)
- [New Relic OTLP attribute limits](https://docs.newrelic.com/docs/more-integrations/open-source-telemetry-integrations/opentelemetry/best-practices/opentelemetry-otlp/)
- [Ory Kratos tracing config](https://www.ory.com/docs/kratos/guides/tracing)
