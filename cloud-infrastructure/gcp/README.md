# GCP

> **Maintained by:** Community contributors

Deployment patterns for running with Ory on Google Cloud. **Not a vendor integration** — Ory Network is reached over HTTPS like any SaaS, and self-hosted Ory products run on standard Kubernetes (GKE) with Cloud SQL Postgres. This directory captures the GCP-side glue.

**Type:** config (deployment pattern)
**Docs page:** [ory.com/docs/integrates-with/cloud-infrastructure/gcp](https://www.ory.com/docs/integrates-with/cloud-infrastructure/gcp)
- [Self-hosted Ory deployment overview](https://www.ory.com/docs/oss/deployment)
- [Hydra Helm chart guide](https://www.ory.com/docs/hydra/self-hosted/kubernetes-helm-chart)
- For Google sign-in see [`social-sign-in/google`](../../social-sign-in/google/) and [`enterprise-sso/google-workspace`](../../enterprise-sso/google-workspace/).

## Two patterns

### Pattern A — GCP app talking to Ory Network (managed)

- Outbound HTTPS to `*.oryapis.com` from the workload's VPC. Default GKE/Cloud Run egress allows this; restrict via Cloud NAT + Firewall rules if needed.
- Store the Ory API key in **Secret Manager**; mount via Workload Identity (GKE) or runtime secret references (Cloud Run).
- Use **Cloud DNS** to map your custom auth domain to `custom.oryapis.com` (CNAME). Configure on the Ory side via `ory update project --custom-domain`.

### Pattern B — Self-hosted Ory on GKE

- **GKE Autopilot** or Standard with Workload Identity enabled.
- **Cloud SQL for PostgreSQL** (HA configuration) for Kratos/Hydra/Keto datastores. Connect via the Cloud SQL Auth Proxy sidecar (preferred) or private IP with VPC peering.
- **Memorystore for Redis** (optional) for session caching.
- Deploy via the official Helm charts (`helm repo add ory https://k8s.ory.sh/helm/charts`).
- **GKE Gateway** (or Ingress with GCLB) for HTTPS termination with a Google-managed certificate.

## License

Apache-2.0. (Configuration / deployment pattern — no source code in this directory.)
