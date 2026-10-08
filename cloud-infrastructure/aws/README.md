# AWS

> **Maintained by:** Community contributors

Deployment patterns for running on AWS with Ory. This is **not a vendor integration** — Ory Network is reached over HTTPS like any SaaS, and self-hosted Ory products run on standard Kubernetes (EKS) with RDS Postgres. This directory captures the two common patterns and the AWS-side glue.

**Type:** config (deployment pattern)
**Docs page:** [ory.com/docs/integrates-with/cloud-infrastructure/aws](https://www.ory.com/docs/integrates-with/cloud-infrastructure/aws)
- [Self-hosted Ory deployment overview](https://www.ory.com/docs/oss/deployment)
- [Hydra Helm chart guide](https://www.ory.com/docs/hydra/self-hosted/kubernetes-helm-chart)
- [Self-hosted operations: scalability, observability, tracing](https://www.ory.com/docs/self-hosted/operations/scalability)

## Two patterns

### Pattern A — AWS app talking to Ory Network (managed)

Standard SaaS pattern:
- Outbound HTTPS (port 443) from your VPC to `*.oryapis.com`. Most security groups need an explicit egress rule for this.
- Store the Ory API key in **AWS Secrets Manager** (or SSM Parameter Store) and inject it into the workload via task/pod IAM.
- Use **Route 53** to map your custom auth domain (e.g. `auth.example.com`) to `<your-project-slug>.projects.oryapis.com` (CNAME). Add the domain to your project in the Ory Console. See [Set up custom domains](https://www.ory.com/docs/guides/custom-domains).

### Pattern B — Self-hosted Ory on EKS

- **EKS** for the cluster (`eksctl create cluster --with-oidc` is the simplest start).
- **RDS PostgreSQL** Multi-AZ for Kratos/Hydra/Keto datastores. Tune `max_connections` and `shared_buffers` for the workload.
- Deploy via the official Helm charts (`helm repo add ory https://k8s.ory.sh/helm/charts`).
- **AWS Load Balancer Controller** (ALB Ingress) for HTTPS termination with an ACM certificate.

## License

Apache-2.0. (Configuration / deployment pattern — no source code in this directory.)
