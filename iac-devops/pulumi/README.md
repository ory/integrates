# Pulumi Provider for Ory Network

Manage your Ory Network configuration as infrastructure-as-code using Pulumi in TypeScript, Go, or Python.

## Overview

The Ory Pulumi provider enables declarative management of Ory Network resources using general-purpose programming languages. Define identity schemas, OAuth2 clients, project settings, and webhooks with the full power of your preferred language — loops, conditionals, functions, and type safety.

| Feature | Details |
|---------|---------|
| Provider | `ory/ory` |
| Languages | TypeScript, Go, Python, C# |
| Ory Platform | Ory Network (managed cloud) |
| Pulumi | >= 3.0 |

## Prerequisites

- Ory Network account and project
- Ory API key (created in the Ory Console under **Settings > API Keys**)
- Pulumi CLI installed
- Node.js >= 18 (TypeScript), Go >= 1.21, or Python >= 3.9

## Installation

### TypeScript / JavaScript

```bash
npm install @ory/pulumi
```

### Go

```bash
go get github.com/ory/pulumi-ory/sdk/go/ory
```

### Python

```bash
pip install pulumi-ory
```

## Provider Configuration

Set your credentials as Pulumi config secrets or environment variables:

```bash
# Via Pulumi config (encrypted in state)
pulumi config set ory:apiKey --secret <YOUR_ORY_API_KEY>
pulumi config set ory:project <YOUR_PROJECT_SLUG>

# Or via environment variables
export ORY_API_KEY=ory_pat_...
export ORY_PROJECT=your-project-slug
```

## Example: TypeScript

```typescript
// index.ts
import * as pulumi from "@pulumi/pulumi";
import * as ory from "@ory/pulumi";

// ---------- Identity Schema ----------

const customerSchema = new ory.IdentitySchema("customer", {
  name: "customer_v1",
  schema: JSON.stringify({
    $id: "https://schemas.ory.sh/presets/kratos/identity.email.schema.json",
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "Customer",
    type: "object",
    properties: {
      traits: {
        type: "object",
        properties: {
          email: {
            type: "string",
            format: "email",
            title: "Email",
            "ory.sh/kratos": {
              credentials: {
                password: { identifier: true },
                webauthn: { identifier: true },
                totp: { account_name: true },
              },
              verification: { via: "email" },
              recovery: { via: "email" },
            },
          },
          name: {
            type: "object",
            properties: {
              first: { type: "string", title: "First Name" },
              last: { type: "string", title: "Last Name" },
            },
          },
        },
        required: ["email"],
        additionalProperties: false,
      },
    },
  }),
});

// ---------- OAuth2 Clients ----------

const spaClient = new ory.OAuth2Client("frontend-spa", {
  clientName: "Frontend SPA",
  grantTypes: ["authorization_code", "refresh_token"],
  responseTypes: ["code"],
  redirectUris: [
    "https://app.example.com/callback",
    "http://localhost:3000/callback",
  ],
  postLogoutRedirectUris: ["https://app.example.com"],
  tokenEndpointAuthMethod: "none",
  scope: "openid offline_access email profile",
});

const backendClient = new ory.OAuth2Client("backend-service", {
  clientName: "Backend Service",
  grantTypes: ["client_credentials"],
  responseTypes: ["token"],
  tokenEndpointAuthMethod: "client_secret_post",
  scope: "openid",
});

// ---------- Webhooks ----------

const config = new pulumi.Config();
const webhookSecret = config.requireSecret("webhookSecret");

const postRegistrationHook = new ory.Webhook("post-registration", {
  event: "registration",
  url: "https://api.example.com/hooks/ory/registration",
  method: "POST",
  headers: {
    "X-Webhook-Secret": webhookSecret,
    "Content-Type": "application/json",
  },
  body: `function(ctx) {
    user_id: ctx.identity.id,
    email: ctx.identity.traits.email,
    name: {
      first: ctx.identity.traits.name.first,
      last: ctx.identity.traits.name.last,
    },
    event: "registration",
  }`,
});

// ---------- Exports ----------

export const spaClientId = spaClient.clientId;
export const backendClientId = backendClient.clientId;
export const backendClientSecret = backendClient.clientSecret;
export const schemaId = customerSchema.id;
```

### Pulumi.yaml

```yaml
name: ory-infrastructure
runtime: nodejs
description: Ory Network infrastructure managed via Pulumi

config:
  ory:project:
    description: Ory Network project slug
  ory:apiKey:
    secret: true
    description: Ory Network API key
  webhookSecret:
    secret: true
    description: Shared secret for webhook verification
```

### package.json

```json
{
  "name": "ory-infrastructure",
  "main": "index.ts",
  "devDependencies": {
    "@types/node": "^20",
    "typescript": "^5"
  },
  "dependencies": {
    "@pulumi/pulumi": "^3.0.0",
    "@ory/pulumi": "^0.1.0"
  }
}
```

## Example: Go

```go
// main.go
package main

import (
	"encoding/json"

	"github.com/ory/pulumi-ory/sdk/go/ory"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		cfg := config.New(ctx, "")

		// Identity Schema
		schemaJSON, _ := json.Marshal(map[string]interface{}{
			"$id":     "https://schemas.ory.sh/presets/kratos/identity.email.schema.json",
			"$schema": "http://json-schema.org/draft-07/schema#",
			"title":   "Customer",
			"type":    "object",
			"properties": map[string]interface{}{
				"traits": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"email": map[string]interface{}{
							"type":   "string",
							"format": "email",
							"title":  "Email",
						},
					},
					"required": []string{"email"},
				},
			},
		})

		schema, err := ory.NewIdentitySchema(ctx, "customer", &ory.IdentitySchemaArgs{
			Name:   pulumi.String("customer_v1"),
			Schema: pulumi.String(string(schemaJSON)),
		})
		if err != nil {
			return err
		}

		// OAuth2 Client
		client, err := ory.NewOAuth2Client(ctx, "frontend-spa", &ory.OAuth2ClientArgs{
			ClientName:             pulumi.String("Frontend SPA"),
			GrantTypes:             pulumi.StringArray{pulumi.String("authorization_code"), pulumi.String("refresh_token")},
			ResponseTypes:          pulumi.StringArray{pulumi.String("code")},
			RedirectUris:           pulumi.StringArray{pulumi.String("https://app.example.com/callback")},
			TokenEndpointAuthMethod: pulumi.String("none"),
			Scope:                  pulumi.String("openid offline_access email profile"),
		})
		if err != nil {
			return err
		}

		// Webhook
		webhookSecret := cfg.RequireSecret("webhookSecret")
		_, err = ory.NewWebhook(ctx, "post-registration", &ory.WebhookArgs{
			Event:  pulumi.String("registration"),
			Url:    pulumi.String("https://api.example.com/hooks/ory/registration"),
			Method: pulumi.String("POST"),
			Headers: pulumi.StringMap{
				"X-Webhook-Secret": webhookSecret,
			},
		})
		if err != nil {
			return err
		}

		ctx.Export("schemaId", schema.ID())
		ctx.Export("clientId", client.ClientId)

		return nil
	})
}
```

## Example: Python

```python
# __main__.py
import json
import pulumi
import pulumi_ory as ory

config = pulumi.Config()

# Identity Schema
schema = ory.IdentitySchema(
    "customer",
    name="customer_v1",
    schema=json.dumps({
        "$id": "https://schemas.ory.sh/presets/kratos/identity.email.schema.json",
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "Customer",
        "type": "object",
        "properties": {
            "traits": {
                "type": "object",
                "properties": {
                    "email": {
                        "type": "string",
                        "format": "email",
                        "title": "Email",
                    },
                    "name": {
                        "type": "object",
                        "properties": {
                            "first": {"type": "string"},
                            "last": {"type": "string"},
                        },
                    },
                },
                "required": ["email"],
            },
        },
    }),
)

# OAuth2 Client
spa_client = ory.OAuth2Client(
    "frontend-spa",
    client_name="Frontend SPA",
    grant_types=["authorization_code", "refresh_token"],
    response_types=["code"],
    redirect_uris=["https://app.example.com/callback"],
    token_endpoint_auth_method="none",
    scope="openid offline_access email profile",
)

# Webhook
webhook_secret = config.require_secret("webhookSecret")

post_registration = ory.Webhook(
    "post-registration",
    event="registration",
    url="https://api.example.com/hooks/ory/registration",
    method="POST",
    headers={
        "X-Webhook-Secret": webhook_secret,
    },
)

# Exports
pulumi.export("schema_id", schema.id)
pulumi.export("spa_client_id", spa_client.client_id)
```

## Multi-Stack Pattern (Environments)

```bash
# Create per-environment stacks
pulumi stack init dev
pulumi stack init staging
pulumi stack init production

# Per-stack configuration
pulumi config set ory:project dev-project-slug --stack dev
pulumi config set ory:project prod-project-slug --stack production
pulumi config set ory:apiKey --secret --stack production
```

## CI/CD Integration

```yaml
# .github/workflows/ory-pulumi.yml
name: Ory Pulumi

on:
  push:
    branches: [main]
    paths: ["pulumi/**"]
  pull_request:
    paths: ["pulumi/**"]

jobs:
  pulumi:
    runs-on: ubuntu-latest
    env:
      PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
      ORY_API_KEY: ${{ secrets.ORY_API_KEY }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
        working-directory: pulumi/

      - uses: pulumi/actions@v5
        with:
          command: preview
          work-dir: pulumi/
          stack-name: production
        if: github.event_name == 'pull_request'

      - uses: pulumi/actions@v5
        with:
          command: up
          work-dir: pulumi/
          stack-name: production
        if: github.ref == 'refs/heads/main'
```

## Comparison: Pulumi vs Terraform for Ory

| Feature | Pulumi | Terraform |
|---|---|---|
| Language | TypeScript, Go, Python, C# | HCL |
| Type safety | Yes (in TS, Go) | Limited |
| Loops / conditionals | Native language features | `count`, `for_each`, `dynamic` |
| Testing | Standard unit test frameworks | `terraform test` |
| State management | Pulumi Cloud, S3, local | Terraform Cloud, S3, local |
| Secret handling | Built-in encryption | Vault, env vars |

## References

- [Pulumi Documentation](https://www.pulumi.com/docs/)
- [Ory Network API Reference](https://www.ory.sh/docs/reference/api)
- [Ory CLI Documentation](https://www.ory.sh/docs/cli)
