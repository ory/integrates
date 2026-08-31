# YugabyteDB

> **Maintained by:** Ory Engineering

[YugabyteDB](https://www.yugabyte.com) is a distributed SQL database — horizontal scalability, strong consistency, and PostgreSQL wire-protocol compatibility. Self-hosted Ory deployments can use it as the primary datastore when they need a distributed database without adopting CockroachDB.

**Type:** config (DSN scheme + cluster-side settings — no source code)
**Docs page:** [ory.com/docs/integrates-with/data-persistence/yugabytedb](https://www.ory.com/docs/integrates-with/data-persistence/yugabytedb)

## Availability

| Product                  | Availability        | Configuration        |
| ------------------------ | ------------------- | -------------------- |
| Ory Kratos Identities    | OEL images only     | `dsn: yugabyte://…`  |
| Ory Hydra Authorization  | OEL images only     | `dsn: yugabyte://…`  |
| Ory Keto Permissions     | OEL images only     | `dsn: yugabyte://…`  |
| Ory Polis B2B Federation | Open source and OEL | `DB_TYPE=yugabytedb` |

## Pattern

YugabyteDB is a first-class dialect, not PostgreSQL in disguise. Point `dsn` at the cluster with the `yugabyte://` scheme (`yugabytedb://` is an accepted synonym):

```
yugabyte://user:password@host:5433/ory_kratos?sslmode=verify-full
```

Port 5433 is the default YSQL port. The DSN accepts the same parameters as PostgreSQL: `sslmode`, `application_name`, `search_path`, the `sslcert`, `sslkey`, and `sslrootcert` paths, and the connection pool settings.

Run migrations as on any other database — `kratos migrate sql` for Ory Kratos Identities, and the equivalent command for the other services.

## Configuration notes

- **Use `yugabyte://`, never `postgres://`.** A `postgres://` DSN aimed at a YugabyteDB cluster selects the PostgreSQL migration set, some of which YugabyteDB rejects. OEL images detect the mismatch at startup and refuse to start, naming the scheme to use instead.
- **Migrations run with autocommit.** YugabyteDB applies schema changes outside a transaction. Current Ory versions ship one statement per migration file and are safe to rerun. If a migration is interrupted, compare the live schema against the migration file, then apply the remaining statements or reverse the applied ones before rerunning.
- **`READ COMMITTED` maps to snapshot isolation** unless `yb_enable_read_committed_isolation` is enabled on the cluster. Ory retries serialization failures rather than lowering the isolation level, so no client-side change is needed.

## Differences from CockroachDB

Several Ory features are built on CockroachDB-specific capabilities and are absent on YugabyteDB:

- **Row-level TTL retention** requires CockroachDB; its retention migrations fail against another database.
- **Multi-region table localities** (`REGIONAL BY ROW`, `GLOBAL`) are CockroachDB features, so the multi-region migrations aren't applied.
- **Eventually consistent reads have no effect.** Follower reads are a CockroachDB feature; requests asking for eventual consistency are served with strong consistency. Only the latency benefit is absent.

## Ory Polis B2B Federation

Ory Polis selects YugabyteDB through environment variables rather than a DSN scheme, and reuses the PostgreSQL TypeORM driver:

```bash
DB_ENGINE=sql
DB_TYPE=yugabytedb
DB_URL=postgresql://yugabyte@localhost:5433/yugabyte
```

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
