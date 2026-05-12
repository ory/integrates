# Kubernetes

> **Maintained by:** Community contributors

Raw Kubernetes manifests for deploying the open-source Ory stack (Kratos, Hydra, Keto, Oathkeeper) without Helm — useful for teams using GitOps tools (Flux, ArgoCD) or that need fine-grained control over the manifests.

**Type:** config (deployment pattern)
**Docs page:** Per-product install guides on ory.com/docs:
- [Kratos install](https://www.ory.com/docs/kratos/install)
- [Hydra install](https://www.ory.com/docs/hydra/self-hosted/install)
- [Keto install](https://www.ory.com/docs/keto/install)
- [Oathkeeper install](https://www.ory.com/docs/oathkeeper/install)

## What's in this directory

Reference manifests for the full stack — Deployments, Services (split public/admin), ConfigMaps, Secrets, optional Ingress. Pattern: each Ory component as a separate Deployment, public APIs exposed via Service of type `ClusterIP` and reached through an Ingress.

## When to use this vs. Helm

- **Helm** ([`iac-devops/helm`](../../iac-devops/helm/)) is the officially maintained path. Pin the chart version, override values, done.
- **Raw manifests** here when you need: GitOps with full visibility into each resource, customizations the Helm chart doesn't expose, or tight coupling with cluster-specific tooling (e.g. Kustomize overlays per environment).

For every other case, prefer Helm.

## License

Apache-2.0. (Configuration / deployment pattern — no source code in this directory.)
