# Pulumi

> **Maintained by:** Community contributors

> **Status:** No official Ory Pulumi provider. This directory documents the two community paths to managing Ory Network with Pulumi.

**Type:** config (IaC — no source code in this directory)

## How to use Pulumi with Ory Network

### Option 1 — Bridge the official Terraform provider (recommended)

Pulumi can consume any Terraform provider via [`pulumi-terraform-bridge`](https://github.com/pulumi/pulumi-terraform-bridge), turning the official [`ory/ory` Terraform provider](https://registry.terraform.io/providers/ory/ory) into a Pulumi-callable SDK. This is the closest you get to a first-class experience without a hand-written Pulumi provider.

The trade-off: you maintain the bridge build for your team or generate the SDK on demand; you do not get an official, regularly published Pulumi package.

### Option 2 — Call the Ory Network REST API from a `dynamic` Pulumi resource

For a small number of resources, write a Pulumi `dynamic` provider that calls the [Ory Network REST API](https://www.ory.com/docs/reference/api) directly using the language SDK of your choice (`@ory/client` for TypeScript, `ory-client` for Go/Python). State diffing and create/update/delete logic is your responsibility.

This is the right choice for a few one-off resources or for plumbing Ory state into a larger Pulumi-managed system.

### Option 3 — Use the Terraform provider directly (escape hatch)

If you already manage some infrastructure with Terraform, the simplest answer is often: keep Ory in Terraform and don't try to bring it under Pulumi at all. See [`iac-devops/terraform`](../terraform/).

## Why no official provider?

Ory officially supports a Terraform provider but does not currently publish or maintain a Pulumi provider. Asks for one are tracked in the Ory community channels.

## License

Apache-2.0. (Configuration / IaC — no source code in this directory.)
