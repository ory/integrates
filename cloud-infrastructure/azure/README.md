# Microsoft Azure — Ory Network Integration

> **Maintained by:** Community contributors

## Overview

Microsoft Azure is a major public cloud and a common deployment target for self-hosted Ory products. Open-source Kratos, Hydra, Keto, and Oathkeeper run cleanly on Azure Kubernetes Service (AKS) or Azure Container Apps with Azure Database for PostgreSQL or Azure Cosmos DB for PostgreSQL as the data store, and integrate with Microsoft Entra ID for enterprise SSO use cases.

## How it works

This integration is a deployment recipe, not a webhook. It documents three reference patterns:

1. **AKS + Helm.** Deploy the Ory Helm charts on AKS, with the database in Azure Database for PostgreSQL Flexible Server.
2. **Container Apps.** Deploy each Ory service as a separate Container App, with auto-scaling on HTTP concurrency and the database again in Azure Database for PostgreSQL.
3. **App Service for Containers.** Simpler than Container Apps; suitable for staging or non-critical workloads.

For Microsoft Entra ID **as an identity provider**, see [`enterprise-sso/microsoft-entra-id`](../../enterprise-sso/microsoft-entra-id) — that is a separate integration covering OIDC / SAML federation between Entra ID and Ory.

## Reference architecture (AKS)

```
Internet
  └─ Azure Front Door (TLS termination, WAF)
       └─ AKS Ingress (NGINX or Application Gateway Ingress Controller)
            ├─ Kratos (Deployment + Service)
            ├─ Hydra (Deployment + Service)
            ├─ Oathkeeper (Deployment + Service)
            └─ Keto (Deployment + Service)
                 ↓
            Azure Database for PostgreSQL Flexible Server
                 ↓
            Azure Key Vault (secrets, signing keys)
                 ↓
            Azure Monitor / Log Analytics (logs)
            New Relic / Datadog / Grafana Cloud (traces, optional)
```

## Prerequisites

1. **Azure subscription** with permission to create AKS clusters, PostgreSQL servers, and Key Vault.
2. **`az` CLI** authenticated to the target subscription.
3. **`kubectl`**, **Helm 3**, and **Terraform** (recommended for repeatable provisioning).
4. **DNS** for the Ory endpoints (verification, login, etc.).

## Configuration

### 1. Provision infrastructure

A minimal Terraform module that lays down AKS + PostgreSQL + Key Vault is the recommended starting point. Reference variables:

| Variable | Example |
|---|---|
| `location` | `eastus2` |
| `aks_node_size` | `Standard_D4s_v5` |
| `postgres_sku` | `GP_Standard_D2s_v3` |
| `postgres_version` | `16` |
| `key_vault_sku` | `standard` |

### 2. Create the database and secrets

```bash
# Postgres database for each Ory service
az postgres flexible-server db create -g <rg> -s <pg-server> -d kratos
az postgres flexible-server db create -g <rg> -s <pg-server> -d hydra
az postgres flexible-server db create -g <rg> -s <pg-server> -d keto

# Store DSNs in Key Vault
az keyvault secret set --vault-name <kv> --name kratos-dsn  --value "postgres://..."
az keyvault secret set --vault-name <kv> --name hydra-dsn   --value "postgres://..."
az keyvault secret set --vault-name <kv> --name keto-dsn    --value "postgres://..."
```

### 3. Deploy via Helm

```bash
helm repo add ory https://k8s.ory.sh/helm/charts
helm install kratos    ory/kratos    -f values-kratos.yaml
helm install hydra     ory/hydra     -f values-hydra.yaml
helm install oathkeeper ory/oathkeeper -f values-oathkeeper.yaml
helm install keto      ory/keto      -f values-keto.yaml
```

Use the **CSI Secret Store driver** to mount Key Vault secrets into pods rather than putting DSNs in Helm values.

### 4. Wire up observability

- **Logs:** Azure Monitor Container Insights, or a sidecar to ship to your SIEM of choice.
- **Traces / metrics:** OpenTelemetry collector → New Relic / Datadog / Grafana Cloud (see the corresponding entries in this repo).

## Notes

- Azure Database for PostgreSQL Flexible Server is the right choice for production; Single Server is being retired.
- AKS managed identities are the cleanest way to grant Ory pods access to Key Vault — avoid embedding service-principal secrets.
- If you are running multi-region active-active, the Postgres replication topology is the single hardest part of the design. Engage Microsoft and Ory before committing to a topology.

## Resources

- [Ory Helm charts](https://github.com/ory/k8s)
- [Azure Database for PostgreSQL Flexible Server](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/overview)
- [AKS CSI Secret Store driver for Key Vault](https://learn.microsoft.com/en-us/azure/aks/csi-secrets-store-driver)
- [Microsoft Entra ID + Ory federation](../../enterprise-sso/microsoft-entra-id)
