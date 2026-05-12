# CockroachDB

> **Maintained by:** Community contributors

[CockroachDB](https://www.cockroachlabs.com) is a distributed SQL database — horizontal scalability, strong consistency, multi-region survivability, with PostgreSQL wire-protocol compatibility. Ory components (Kratos, Hydra, Keto, Oathkeeper) use PostgreSQL as the primary datastore, so CockroachDB is a viable backend for deployments needing geographic distribution or high-availability that exceeds what a single Postgres can deliver.

**Type:** config (DSN substitution + Cockroach-aware tuning — no source code)
**Docs page:** No dedicated CockroachDB page on ory.com/docs. Ory's [self-hosted deployment overview](https://www.ory.com/docs/self-hosted/deployment) covers Postgres-compatible backends generically; the same DSN format works for Cockroach.

## Pattern

Cockroach speaks the Postgres wire protocol, so Ory products accept a Cockroach DSN with no changes:

```
postgres://user:password@cockroach-host:26257/ory_kratos?sslmode=verify-full&options=--cluster%3D<cluster-id>
```

Migrations run with `kratos migrate sql` (and similar for Hydra/Keto) — Cockroach accepts the same DDL Ory emits for Postgres, with a few caveats.

## Cockroach-aware tuning

- **Foreign-key constraints**: Cockroach is more particular than Postgres about FK ordering during high concurrency. Ory's schema is FK-heavy; expect some `40001 retry` errors under load and configure clients to retry transactions per Cockroach's standard pattern.
- **`SERIAL` vs `UUID`**: Ory schemas use UUIDs (good for Cockroach distribution); legacy `SERIAL` columns would hot-shard a single node — verify no Ory product is using SERIAL in your version.
- **Cluster setting `kv.transaction.write_pipelining.enabled`** off can simplify transaction debugging during initial rollout; turn back on for production.
- **Serverless vs Self-hosted**: CockroachDB Serverless has request-per-second limits that bite high-traffic Ory deployments hard — Self-hosted (Dedicated) is the right tier for production identity workloads.

## Status

Community / proposed — no dedicated Ory documentation. Pattern is "use Postgres DSN; tune for Cockroach's distributed-transaction model."

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
