# Terraform

> **Maintained by:** Ory Engineering

Official Terraform provider for managing **Ory Network** resources as infrastructure-as-code — identity schemas, OAuth2 clients, project configuration, identities, organizations, permissions, and webhooks. Source at [github.com/ory/terraform-provider-ory](https://github.com/ory/terraform-provider-ory); registry source `ory/ory`.

**Type:** config (Terraform provider — no source code in this directory)
**Docs page:** [ory.com/docs/integrates-with/iac-devops/terraform](https://www.ory.com/docs/integrates-with/iac-devops/terraform)
**Provider docs:** [registry.terraform.io/providers/ory/ory](https://registry.terraform.io/providers/ory/ory/latest/docs)
**OpenTofu:** also published on the [OpenTofu registry](https://search.opentofu.org/provider/ory/ory/latest) — same `ory/ory` source, so the configuration below works identically under `tofu`.

> This provider targets **Ory Network only** — it does not manage self-hosted Ory deployments. For self-hosted, use [`iac-devops/helm`](../helm/) or raw [`containerization/kubernetes`](../../containerization/kubernetes/) manifests.

## Quick start

```hcl
terraform {
  required_providers {
    ory = {
      source  = "ory/ory"
      version = "~> 1.0"
    }
  }
}

provider "ory" {
  # Or set the ORY_API_KEY env var.
  api_key = var.ory_api_key
  # Project slug or SDK URL — also via ORY_PROJECT / ORY_SDK_URL.
  project = var.ory_project_slug
}
```

A canonical example layout (with `ory_identity_schema`, `ory_oauth2_client`, `ory_project_config`, `ory_webhook` resources and a multi-environment module) is in `examples/` alongside this README.

## Notable behaviours

- Many `ory_project_config` attributes were renamed to follow the OpenAPI spec naming convention. Old names still work but emit deprecation warnings; the [migration script](https://github.com/ory/terraform-provider-ory/blob/main/scripts/migrate-deprecated-attrs.sh) in the provider repo rewrites your `.tf` files.
- Ory uses two API key types — Workspace API keys and Project API keys. Use the right key for the right resource (Workspace keys can manage projects; Project keys can manage in-project resources).
- Existing resources (created via Console / CLI) can be adopted with `terraform import ory_<resource>.<name> <id>`.

## License

Apache-2.0. (Configuration / IaC — no source code in this directory.)
