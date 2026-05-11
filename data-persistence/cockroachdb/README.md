# CockroachDB Integration with Ory

## Overview

CockroachDB is a distributed SQL database that provides horizontal scalability, strong consistency, and multi-region survivability while maintaining PostgreSQL wire protocol compatibility. Ory components (Kratos, Hydra, Keto) use PostgreSQL as their primary database, making CockroachDB a viable backend for deployments requiring geographic distribution, high availability, and global scale.

This guide covers configuring CockroachDB as the persistence layer for self-hosted Ory components. Note: Ory Network (managed cloud) manages its own persistence; this applies to self-hosted Ory deployments.

Key capabilities:
- PostgreSQL wire-compatible: Ory components connect using standard PostgreSQL DSN
- Multi-region deployments with low-latency reads via locality-aware routing
- Automatic replication and failover across regions
- Serializable isolation by default (strongest consistency)
- CockroachDB Serverless and Dedicated options available

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Multi-Region Deployment                                        │
│                                                                 │
│  US-East                    EU-West                  APAC       │
│  ┌───────────┐             ┌───────────┐           ┌─────────┐ │
│  │ Ory Kratos│             │ Ory Kratos│           │Ory Kratos│ │
│  │ Ory Hydra │             │ Ory Hydra │           │Ory Hydra │ │
│  └─────┬─────┘             └─────┬─────┘           └────┬────┘ │
│        │                         │                      │      │
│  ┌─────▼─────┐             ┌─────▼─────┐           ┌────▼────┐ │
│  │CockroachDB│◀───────────▶│CockroachDB│◀─────────▶│CockroachDB│
│  │  Node 1   │  Raft       │  Node 2   │  Raft     │  Node 3 │ │
│  │  (us-east)│  Replication│  (eu-west)│  Replicas │  (apac) │ │
│  └───────────┘             └───────────┘           └─────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **CockroachDB Cluster**: CockroachDB Dedicated, Serverless, or self-hosted (v22.2+)
- **Ory Components**: Self-hosted Ory Kratos, Hydra, and/or Keto
- **TLS Certificates**: For secure client-cluster connections

## Configuration

### Step 1: Set Up CockroachDB

**CockroachDB Serverless (Cloud):**

1. Sign up at [CockroachDB Cloud](https://cockroachlabs.cloud/)
2. Create a new serverless cluster
3. Choose a multi-region plan if needed
4. Download the CA certificate
5. Note the connection string

**Self-hosted CockroachDB:**

```bash
# Start a 3-node cluster
cockroach start \
  --insecure=false \
  --certs-dir=/certs \
  --store=/data/cockroach \
  --listen-addr=node1:26257 \
  --http-addr=node1:8080 \
  --join=node1:26257,node2:26257,node3:26257

# Initialize the cluster (first time only)
cockroach init --certs-dir=/certs --host=node1:26257
```

### Step 2: Create Databases

```sql
-- Connect to CockroachDB
cockroach sql --certs-dir=/certs --host=node1:26257

-- Create databases for each Ory component
CREATE DATABASE kratos;
CREATE DATABASE hydra;
CREATE DATABASE keto;

-- Create a dedicated user
CREATE USER ory WITH PASSWORD '<secure-password>';

-- Grant privileges
GRANT ALL ON DATABASE kratos TO ory;
GRANT ALL ON DATABASE hydra TO ory;
GRANT ALL ON DATABASE keto TO ory;
```

### Step 3: Configure Connection String

CockroachDB uses PostgreSQL-compatible connection strings:

```bash
# CockroachDB Cloud (Serverless)
DSN="postgresql://ory:<password>@<cluster-host>:26257/kratos?sslmode=verify-full&sslrootcert=/certs/ca.crt"

# Self-hosted CockroachDB
DSN="postgresql://ory:<password>@node1:26257/kratos?sslmode=verify-full&sslrootcert=/certs/ca.crt&sslcert=/certs/client.ory.crt&sslkey=/certs/client.ory.key"
```

### Step 4: Configure Ory Components

**Ory Kratos (`kratos.yml`):**

```yaml
dsn: postgresql://ory:<password>@cockroachdb:26257/kratos?sslmode=verify-full&sslrootcert=/certs/ca.crt

courier:
  smtp:
    connection_uri: smtp://user:pass@smtp.example.com:587

selfservice:
  default_browser_return_url: https://app.example.com/
```

**Ory Hydra (`hydra.yml`):**

```yaml
dsn: postgresql://ory:<password>@cockroachdb:26257/hydra?sslmode=verify-full&sslrootcert=/certs/ca.crt

urls:
  self:
    issuer: https://auth.example.com
  consent: https://app.example.com/consent
  login: https://app.example.com/login
```

**Ory Keto (`keto.yml`):**

```yaml
dsn: postgresql://ory:<password>@cockroachdb:26257/keto?sslmode=verify-full&sslrootcert=/certs/ca.crt

namespaces:
  - id: 0
    name: app
```

### Step 5: Run Migrations

```bash
# Kratos migration
kratos migrate sql -e --yes \
  "postgresql://ory:<password>@cockroachdb:26257/kratos?sslmode=verify-full&sslrootcert=/certs/ca.crt"

# Hydra migration
hydra migrate sql -e --yes \
  "postgresql://ory:<password>@cockroachdb:26257/hydra?sslmode=verify-full&sslrootcert=/certs/ca.crt"

# Keto migration
keto migrate up -e --yes \
  "postgresql://ory:<password>@cockroachdb:26257/keto?sslmode=verify-full&sslrootcert=/certs/ca.crt"
```

### Step 6: Multi-Region Setup

For multi-region deployments, configure CockroachDB locality and zone constraints:

```sql
-- Configure localities (done during node startup via --locality flag)
-- cockroach start --locality=region=us-east-1,zone=us-east-1a ...
-- cockroach start --locality=region=eu-west-1,zone=eu-west-1a ...
-- cockroach start --locality=region=ap-southeast-1,zone=ap-southeast-1a ...

-- Set the database to survive region failures
ALTER DATABASE kratos SET PRIMARY REGION = "us-east-1";
ALTER DATABASE kratos ADD REGION "eu-west-1";
ALTER DATABASE kratos ADD REGION "ap-southeast-1";
ALTER DATABASE kratos SURVIVE REGION FAILURE;

-- Enable locality-optimized reads (for global tables)
ALTER DATABASE kratos SET SECONDARY REGION = "eu-west-1";

-- For tables that benefit from global reads (e.g., configuration):
-- ALTER TABLE kratos.identity_credential_types SET LOCALITY GLOBAL;

-- For tables with regional affinity (e.g., identities):
-- ALTER TABLE kratos.identities SET LOCALITY REGIONAL BY ROW;
```

### Connection Configuration for Multi-Region

```bash
# Use a region-aware connection string (CockroachDB Cloud)
DSN="postgresql://ory:<password>@<cluster>.cockroachlabs.cloud:26257/kratos?sslmode=verify-full&sslrootcert=/certs/ca.crt&options=--cluster%3D<cluster-name>"

# For self-hosted, point to the nearest node
# US application:
DSN_US="postgresql://ory:<password>@us-node:26257/kratos?sslmode=verify-full&sslrootcert=/certs/ca.crt"

# EU application:
DSN_EU="postgresql://ory:<password>@eu-node:26257/kratos?sslmode=verify-full&sslrootcert=/certs/ca.crt"
```

## Helm Chart Configuration

```yaml
# kratos-values.yaml (for Ory Helm charts)
kratos:
  config:
    dsn: postgresql://ory:password@cockroachdb-public:26257/kratos?sslmode=verify-full&sslrootcert=/certs/ca.crt

  extraVolumes:
    - name: cockroach-certs
      secret:
        secretName: cockroachdb-client-certs

  extraVolumeMounts:
    - name: cockroach-certs
      mountPath: /certs
      readOnly: true
```

## Performance Tuning

| Parameter | Recommended Value | Notes |
|-----------|-------------------|-------|
| **Connection pool size** | 10-20 per Ory pod | CockroachDB handles connection overhead well |
| **`idle_in_transaction_session_timeout`** | `30s` | Prevents long-running transactions |
| **`statement_timeout`** | `60s` | Limits query execution time |
| **`default_transaction_isolation`** | `serializable` (default) | CockroachDB default; do not change |
| **Retry logic** | Built into CockroachDB driver | CockroachDB may retry serializable transactions |

## Testing

### 1. Verify Connection

```bash
cockroach sql --certs-dir=/certs --host=node1:26257 \
  -e "SELECT version();"
```

### 2. Run Ory Migration Check

```bash
kratos migrate sql status \
  "postgresql://ory:<password>@cockroachdb:26257/kratos?sslmode=verify-full&sslrootcert=/certs/ca.crt"
```

### 3. Test Identity Operations

```bash
# Create test identity via Ory admin API
curl -X POST http://localhost:4434/admin/identities \
  -H "Content-Type: application/json" \
  -d '{"schema_id":"default","traits":{"email":"test@example.com"}}'

# Verify data in CockroachDB
cockroach sql --certs-dir=/certs --host=node1:26257 \
  -d kratos -e "SELECT id, state FROM identities LIMIT 5;"
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Connection refused** | Node not ready or TLS mismatch | Verify node status with `cockroach node status`; check certificate validity |
| **Migration fails** | CockroachDB SQL incompatibility | Check Ory release notes for CockroachDB compatibility; some DDL syntax differs |
| **Transaction retry errors** | Serializable isolation conflicts | CockroachDB retries automatically; ensure drivers handle `40001` error code |
| **Slow queries in multi-region** | Data not co-located with application | Configure `REGIONAL BY ROW` for latency-sensitive tables |
| **Connection pool exhaustion** | Too many Ory pods or pool too large | Tune `max_open_conns` in Ory config; monitor with `cockroach node status` |

## Resources

- [CockroachDB Documentation](https://www.cockroachlabs.com/docs/)
- [CockroachDB Cloud](https://cockroachlabs.cloud/)
- [CockroachDB Multi-Region](https://www.cockroachlabs.com/docs/stable/multiregion-overview)
- [Ory Kratos Database Configuration](https://www.ory.sh/docs/kratos/reference/configuration)
- [Ory Hydra Database Configuration](https://www.ory.sh/docs/hydra/reference/configuration)
- [Ory Self-Hosting Guide](https://www.ory.sh/docs/self-hosted/deployment)
