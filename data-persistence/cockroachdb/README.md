# CockroachDB

> **Maintained by:** Community contributors

[CockroachDB](https://www.cockroachlabs.com) is a distributed SQL database — horizontal scalability, strong consistency, multi-region survivability, with PostgreSQL wire-protocol compatibility. Ory Kratos, Ory Hydra, and Ory Keto support CockroachDB as a datastore, so CockroachDB is a viable backend for deployments needing geographic distribution or high-availability that exceeds what a single Postgres can deliver.

**Type:** config (DSN substitution + Cockroach-aware tuning — no source code)
**Docs page:** [ory.com/docs/integrates-with/data-persistence/cockroachdb](https://www.ory.com/docs/integrates-with/data-persistence/cockroachdb)

## Pattern

Ory connects to CockroachDB with the `cockroach://` DSN scheme:

```
cockroach://user:password@cockroach-host:26257/ory_kratos?sslmode=verify-full
```

Use `cockroach://`, never `postgres://`. The scheme selects CockroachDB-specific migrations; a `postgres://` DSN selects the PostgreSQL migrations, which can fail partway and leave the database partly migrated.

Run migrations with `kratos migrate sql` (and the equivalent for Hydra and Keto) against this DSN.

## Cockroach-aware tuning

- **Foreign-key constraints**: Cockroach is more particular than Postgres about FK ordering during high concurrency. Ory's schema is FK-heavy; expect some `40001 retry` errors under load and configure clients to retry transactions per Cockroach's standard pattern.
- **`SERIAL` vs `UUID`**: Ory schemas use UUIDs (good for Cockroach distribution); legacy `SERIAL` columns would hot-shard a single node — verify no Ory product is using SERIAL in your version.
- **Serverless vs Self-hosted**: CockroachDB Serverless has request-per-second limits that bite high-traffic Ory deployments hard — Self-hosted (Dedicated) is the right tier for production identity workloads.

## Status

Community / proposed — no dedicated Ory documentation. Pattern is "use a `cockroach://` DSN; tune for Cockroach's distributed-transaction model."

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
