# Microsoft Azure

> **Maintained by:** Community contributors

Deployment patterns for running with Ory on Azure. **Not a vendor integration** — Ory Network is reached over HTTPS like any SaaS, and self-hosted Ory products run on standard Kubernetes (AKS) or Azure Container Apps with Azure Database for PostgreSQL. This directory captures the Azure-side glue.

**Type:** config (deployment pattern)
**Docs page:** No Azure-specific Ory page. Relevant Ory docs:
- [Self-hosted Ory deployment overview](https://www.ory.com/docs/self-hosted/deployment)
- [Hydra Helm chart guide](https://www.ory.com/docs/hydra/self-hosted/kubernetes-helm-chart)
- For Microsoft Entra ID social sign-in / enterprise SSO see [`social-sign-in/microsoft`](../../social-sign-in/microsoft/) and [`enterprise-sso/microsoft-entra-id`](../../enterprise-sso/microsoft-entra-id/).

## Two patterns

### Pattern A — Azure app talking to Ory Network (managed)

- Outbound HTTPS (port 443) from your VNet/subnet to `*.oryapis.com`. NSG rule + (if locked-down egress) Azure Firewall application rule.
- Store the Ory API key in **Azure Key Vault**; inject via Workload Identity (AKS) or Container Apps secret references — no env-var secrets in source.
- Use **Azure DNS** to map your custom auth domain to `custom.oryapis.com` (CNAME). Configure on the Ory side via `ory update project --custom-domain`.

### Pattern B — Self-hosted Ory on AKS

- **AKS** with Azure CNI, Workload Identity enabled.
- **Azure Database for PostgreSQL — Flexible Server** for Kratos/Hydra/Keto datastores; pick the Zone-Redundant HA tier for production.
- **Azure Cache for Redis** (optional) for session caching.
- Deploy via the official Helm charts (`helm repo add ory https://k8s.ory.sh/helm/charts`).
- **Application Gateway Ingress Controller** (AGIC) for HTTPS termination with a Key Vault-stored cert.

## License

Apache-2.0. (Configuration / deployment pattern — no source code in this directory.)
