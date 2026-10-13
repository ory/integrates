# Terraform

> **Maintained by:** Ory Engineering

Official Terraform provider for managing **Ory Network** resources as infrastructure-as-code — identity schemas, OAuth2 clients, project configuration, identities, organizations, permissions, and actions (webhooks). Source at [github.com/ory/terraform-provider-ory](https://github.com/ory/terraform-provider-ory); registry source `ory/ory`.

**Type:** config (Terraform provider — no source code in this directory)
**Docs page:** [ory.com/docs/integrates-with/iac-devops/terraform](https://www.ory.com/docs/integrates-with/iac-devops/terraform)
**Provider docs:** [registry.terraform.io/providers/ory/ory](https://registry.terraform.io/providers/ory/ory/latest/docs)
**OpenTofu:** also published on the [OpenTofu registry](https://search.opentofu.org/provider/ory/ory/latest) — same `ory/ory` source, so the configuration below works identically under `tofu`.

> This provider targets **Ory Network only** — it does not manage self-hosted Ory deployments. For self-hosted, use [`iac-devops/helm`](../helm/) or raw [`containerization/kubernetes`](../../containerization/kubernetes/) manifests.

## Quick start

Set the provider's credentials and project in your environment:

```bash
export ORY_WORKSPACE_API_KEY="<workspace-api-key>"
export ORY_PROJECT_API_KEY="<project-api-key>"
export ORY_PROJECT_ID="<project-id>"
export ORY_PROJECT_SLUG="<project-slug>"
```

Use an empty provider block to read these values:

```hcl
terraform {
  required_providers {
    ory = {
      source  = "ory/ory"
      version = "~> 26.3"
    }
  }
}

provider "ory" {}
```

The provider arguments are `workspace_api_key`, `project_api_key`, `project_id`, and `project_slug`, if you prefer to set them in HCL.

Examples in `examples/` alongside this README:

- [`examples/basic`](examples/basic/) — `ory_project_config`, `ory_identity_schema`, `ory_oauth2_client`, and per-method `ory_action` webhooks with their Jsonnet request bodies.
- [`examples/multi-environment`](examples/multi-environment/) — one configuration applied to separate staging and production projects with per-environment `.tfvars` files.

The [provider repository's `examples/` directory](https://github.com/ory/terraform-provider-ory/tree/main/examples) has an example for every resource.

## Notable behaviours

- Many `ory_project_config` attributes were renamed to follow the OpenAPI spec naming convention. Old names still work but emit deprecation warnings; the [migration script](https://github.com/ory/terraform-provider-ory/blob/main/scripts/migrate-deprecated-attrs.sh) in the provider repo rewrites your `.tf` files.
- Ory uses two API key types, and each resource needs a specific one:
  - A Workspace API key (`ory_wak_…`) manages projects, workspaces, organizations, identity schemas, project configuration, actions, social sign-in and SAML providers, SCIM clients, and email templates.
  - A Project API key (`ory_pat_…`) manages identities, OAuth2 clients, and relationships. It can't read or change project configuration.
- To adopt resources created in the Ory Console or with the CLI, run `terraform import` with the import ID format from each resource's documentation. For example, `ory_oauth2_client` takes the client ID, and an `after` `ory_action` takes `<project-id>:<flow>:after:<auth-method>:<method>:<url>` (a `before` action omits `<auth-method>`). Identity schemas can't be imported.

## License

Apache-2.0. (Configuration / IaC — no source code in this directory.)

The examples manage actions for each method in `auth_methods`; include only methods you enable and add `saml` when needed. Stripe registration runs with `response_ignore = true` after identity persistence. Segment and Splunk use separate body templates matching their companion handlers.
