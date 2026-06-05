# Helm

> **Maintained by:** Ory Engineering

Official Helm charts for deploying the self-hosted Ory stack (Kratos, Hydra, Keto, Oathkeeper) on Kubernetes. Charts live in [github.com/ory/k8s](https://github.com/ory/k8s); the chart repo is hosted at `https://k8s.ory.sh/helm/charts`.

**Type:** config (deployment via Helm — no source code in this directory)
**Docs page:** [ory.com/docs/integrates-with/iac-devops/helm](https://www.ory.com/docs/integrates-with/iac-devops/helm) — full guide: [ory.com/docs/hydra/self-hosted/kubernetes-helm-chart](https://www.ory.com/docs/hydra/self-hosted/kubernetes-helm-chart)

| Chart | Component | Source |
| --- | --- | --- |
| `ory/kratos` | Identity (Kratos) | [ory/k8s/helm/charts/kratos](https://github.com/ory/k8s/tree/master/helm/charts/kratos) |
| `ory/hydra` | OAuth2 / OIDC (Hydra) | [ory/k8s/helm/charts/hydra](https://github.com/ory/k8s/tree/master/helm/charts/hydra) |
| `ory/keto` | Authorization (Keto) | [ory/k8s/helm/charts/keto](https://github.com/ory/k8s/tree/master/helm/charts/keto) |
| `ory/oathkeeper` | API gateway (Oathkeeper) | [ory/k8s/helm/charts/oathkeeper](https://github.com/ory/k8s/tree/master/helm/charts/oathkeeper) |

> **Note:** The Ory team marks these charts as *incubation* in the repo README — pin chart versions and review chart changelogs before upgrading.

## Quick start

```bash
helm repo add ory https://k8s.ory.sh/helm/charts
helm repo update

helm install kratos ory/kratos --namespace ory --create-namespace -f kratos-values.yaml
helm install hydra ory/hydra --namespace ory -f hydra-values.yaml
```

Each chart's `values.yaml` is the source of truth for what's configurable; `helm show values ory/kratos` is the fastest way to see current options.

## Production reminders

- Replace every `CHANGE-ME` secret in your `values.yaml` with strong random values; ideally inject via [External Secrets Operator](https://external-secrets.io) from your secret manager rather than committing them.
- Run the database on a managed service (RDS, Cloud SQL, Azure DB) — not in-cluster.
- Enable `automigration` only for the first install; thereafter run migrations as a pre-upgrade Job to keep DB changes auditable.
- Set `development: false`, configure resource requests/limits, and enable the chart's PodDisruptionBudget and HPA stanzas.
- Restrict ingress for the `admin` Service — never expose it publicly.

## License

Apache-2.0. (Configuration / deployment pattern — no source code in this directory.)
