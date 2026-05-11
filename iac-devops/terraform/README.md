# Terraform Provider for Ory Network

Manage your Ory Network configuration as infrastructure-as-code using the official Terraform provider.

## Overview

The Ory Terraform provider enables declarative management of Ory Network resources. Define your identity schemas, OAuth2 clients, project settings, and webhooks in `.tf` files, and let Terraform handle creation, updates, and drift detection.

| Feature | Details |
|---------|---------|
| Provider | `ory-corp/ory` |
| Registry | [registry.terraform.io/providers/ory-corp/ory](https://registry.terraform.io/providers/ory-corp/ory) |
| Ory Platform | Ory Network (managed cloud) |
| Terraform | >= 1.0 |

## Prerequisites

- Ory Network account and project
- Ory API key (created in the Ory Console under **Settings > API Keys**)
- Terraform >= 1.0 installed

## Provider Configuration

```hcl
# providers.tf

terraform {
  required_providers {
    ory = {
      source  = "ory-corp/ory"
      version = "~> 0.1"
    }
  }
}

provider "ory" {
  # Authenticate via API key.
  # Alternatively, set the ORY_API_KEY environment variable.
  api_key = var.ory_api_key

  # Your Ory Network project slug or SDK URL.
  # Alternatively, set ORY_PROJECT or ORY_SDK_URL.
  project = var.ory_project_slug
}

variable "ory_api_key" {
  type      = string
  sensitive = true
}

variable "ory_project_slug" {
  type = string
}
```

## Resources

### Identity Schema

```hcl
# identity_schema.tf

resource "ory_identity_schema" "customer" {
  name = "customer_v1"

  schema = jsonencode({
    "$id"     = "https://schemas.ory.sh/presets/kratos/identity.email.schema.json"
    "$schema" = "http://json-schema.org/draft-07/schema#"
    title     = "Customer"
    type      = "object"

    properties = {
      traits = {
        type = "object"
        properties = {
          email = {
            type   = "string"
            format = "email"
            title  = "Email"
            "ory.sh/kratos" = {
              credentials = {
                password = { identifier = true }
                webauthn = { identifier = true }
                totp     = { account_name = true }
              }
              verification = { via = "email" }
              recovery     = { via = "email" }
            }
          }
          name = {
            type = "object"
            properties = {
              first = { type = "string", title = "First Name" }
              last  = { type = "string", title = "Last Name" }
            }
          }
        }
        required           = ["email"]
        additionalProperties = false
      }
    }
  })
}
```

### OAuth2 Client

```hcl
# oauth2_clients.tf

resource "ory_oauth2_client" "frontend_app" {
  client_name = "Frontend SPA"

  grant_types = [
    "authorization_code",
    "refresh_token",
  ]

  response_types = ["code"]

  redirect_uris = [
    "https://app.example.com/callback",
    "http://localhost:3000/callback",
  ]

  post_logout_redirect_uris = [
    "https://app.example.com",
  ]

  token_endpoint_auth_method = "none" # public client (SPA)

  scope = "openid offline_access email profile"

  metadata = jsonencode({
    environment = var.environment
    team        = "frontend"
  })
}

resource "ory_oauth2_client" "backend_service" {
  client_name = "Backend Service"

  grant_types    = ["client_credentials"]
  response_types = ["token"]

  token_endpoint_auth_method = "client_secret_post"

  scope = "openid"

  metadata = jsonencode({
    environment = var.environment
    team        = "platform"
  })
}
```

### Project Configuration

```hcl
# project.tf

resource "ory_project_config" "main" {
  # Kratos (Identity) settings
  identity_config = jsonencode({
    selfservice = {
      default_browser_return_url = "https://app.example.com/"

      flows = {
        login = {
          ui_url   = "https://app.example.com/login"
          lifespan = "1h"
        }
        registration = {
          ui_url   = "https://app.example.com/register"
          lifespan = "1h"
          after = {
            password = {
              hooks = [
                { hook = "session" },
                { hook = "show_verification_ui" }
              ]
            }
          }
        }
        verification = {
          ui_url   = "https://app.example.com/verify"
          enabled  = true
          lifespan = "24h"
        }
        recovery = {
          ui_url   = "https://app.example.com/recovery"
          enabled  = true
          lifespan = "1h"
        }
        settings = {
          ui_url = "https://app.example.com/settings"
        }
      }

      methods = {
        password = { enabled = true }
        webauthn = {
          enabled = true
          config = {
            rp = {
              display_name = "My App"
              id           = "app.example.com"
              origins      = ["https://app.example.com"]
            }
            passwordless = true
          }
        }
        totp = { enabled = true }
      }
    }

    session = {
      lifespan = "720h" # 30 days
      cookie = {
        same_site = "Lax"
      }
    }

    courier = {
      smtp = {
        from_name    = "My App"
        from_address = "noreply@example.com"
      }
    }
  })
}
```

### Webhooks

```hcl
# webhooks.tf

resource "ory_webhook" "post_registration" {
  event = "registration"
  hook  = "web_hook"

  config = jsonencode({
    url    = "https://api.example.com/hooks/ory/registration"
    method = "POST"

    headers = {
      "X-Webhook-Secret" = var.webhook_secret
      "Content-Type"     = "application/json"
    }

    body = "file:///etc/config/kratos/hooks/post-registration.jsonnet"

    response = {
      ignore = false
      parse  = true
    }

    auth = {
      type = "api_key"
      config = {
        name  = "Authorization"
        value = "Bearer ${var.webhook_api_token}"
        in    = "header"
      }
    }
  })
}

resource "ory_webhook" "post_login" {
  event = "login"
  hook  = "web_hook"

  config = jsonencode({
    url    = "https://api.example.com/hooks/ory/login"
    method = "POST"

    headers = {
      "X-Webhook-Secret" = var.webhook_secret
    }

    body = "file:///etc/config/kratos/hooks/post-login.jsonnet"

    response = {
      ignore = false
      parse  = true
    }
  })
}

variable "webhook_secret" {
  type      = string
  sensitive = true
}

variable "webhook_api_token" {
  type      = string
  sensitive = true
}
```

## Jsonnet Templates for Webhooks

Create a `hooks/` directory alongside your Terraform files.

```jsonnet
// hooks/post-registration.jsonnet
function(ctx) {
  user_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  name: {
    first: ctx.identity.traits.name.first,
    last: ctx.identity.traits.name.last,
  },
  created_at: ctx.identity.created_at,
  event: "registration",
}
```

```jsonnet
// hooks/post-login.jsonnet
function(ctx) {
  user_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  session_id: ctx.session.id,
  event: "login",
}
```

## Full Example: Multi-Environment Setup

```hcl
# environments/production/main.tf

module "ory" {
  source = "../../modules/ory"

  ory_project_slug = "prod-project-abc123"
  environment      = "production"

  base_url         = "https://app.example.com"
  allowed_origins  = ["https://app.example.com"]

  smtp_from        = "noreply@example.com"
  session_lifespan = "720h"

  webhook_base_url = "https://api.example.com/hooks/ory"
  webhook_secret   = var.webhook_secret
}
```

```hcl
# environments/staging/main.tf

module "ory" {
  source = "../../modules/ory"

  ory_project_slug = "staging-project-xyz789"
  environment      = "staging"

  base_url         = "https://staging.example.com"
  allowed_origins  = [
    "https://staging.example.com",
    "http://localhost:3000",
  ]

  smtp_from        = "noreply-staging@example.com"
  session_lifespan = "24h"

  webhook_base_url = "https://api-staging.example.com/hooks/ory"
  webhook_secret   = var.webhook_secret
}
```

## State Management

```hcl
# backend.tf — store state remotely

terraform {
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "ory/production/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}
```

## CI/CD Integration

```yaml
# .github/workflows/ory-terraform.yml
name: Ory Terraform

on:
  push:
    branches: [main]
    paths: ["terraform/**"]
  pull_request:
    paths: ["terraform/**"]

jobs:
  terraform:
    runs-on: ubuntu-latest
    env:
      ORY_API_KEY: ${{ secrets.ORY_API_KEY }}
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "1.7"

      - name: Terraform Init
        run: terraform init
        working-directory: terraform/

      - name: Terraform Plan
        run: terraform plan -out=tfplan
        working-directory: terraform/

      - name: Terraform Apply
        if: github.ref == 'refs/heads/main'
        run: terraform apply -auto-approve tfplan
        working-directory: terraform/
```

## Importing Existing Resources

If you already have resources in Ory Network, import them into Terraform state:

```bash
# Import an existing OAuth2 client
terraform import ory_oauth2_client.frontend_app <client-id>

# Import an existing identity schema
terraform import ory_identity_schema.customer <schema-id>
```

## CLI Equivalent Reference

| Terraform Resource | Ory CLI Equivalent |
|---|---|
| `ory_identity_schema` | `ory update identity-config` |
| `ory_oauth2_client` | `ory create oauth2-client` |
| `ory_project_config` | `ory update project` |
| `ory_webhook` | Configured via project config |

## Troubleshooting

| Issue | Solution |
|---|---|
| `401 Unauthorized` | Verify your `ORY_API_KEY` is valid and has sufficient permissions |
| `409 Conflict` | Resource already exists; use `terraform import` to adopt it |
| Drift detected | Run `terraform plan` to review; `terraform apply` to reconcile |
| Rate limiting | Add `retry` block or reduce parallelism with `-parallelism=1` |

## References

- [Ory Network API Reference](https://www.ory.sh/docs/reference/api)
- [Ory CLI Documentation](https://www.ory.sh/docs/cli)
- [Terraform Registry — Ory Provider](https://registry.terraform.io/providers/ory-corp/ory)
- [Ory Jsonnet Reference](https://www.ory.sh/docs/guides/integrate-with-ory-cloud-through-webhooks)
