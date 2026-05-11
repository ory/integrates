# Terraform Configuration for Ory Network
#
# This example manages Ory Network project configuration as code,
# including identity schemas, OAuth2 clients, and webhook definitions.
#
# Prerequisites:
#   1. Install the Ory Terraform provider
#   2. Set ORY_API_KEY environment variable (from Ory Console → Settings → API Keys)
#      IMPORTANT: Store this key in a secret manager, not in .tfvars files.
#   3. terraform init && terraform plan

terraform {
  required_version = ">= 1.5"
  required_providers {
    ory = {
      source  = "ory/ory"
      version = "~> 0.1" # Check https://registry.terraform.io/providers/ory/ory for latest
    }
  }
}

# The Ory provider authenticates via API key.
# SECURITY: Set ORY_API_KEY as an environment variable.
#   export ORY_API_KEY="ory_pat_..."
# Or use Terraform's native secret management.
provider "ory" {}

# --- Variables ---

variable "project_id" {
  description = "Ory Network project ID"
  type        = string
}

variable "app_url" {
  description = "Your application's base URL"
  type        = string
  default     = "https://app.example.com"
}

variable "webhook_base_url" {
  description = "Base URL for webhook handlers"
  type        = string
  default     = "https://webhooks.example.com"
}

variable "webhook_secret" {
  description = "Shared secret for webhook authentication"
  type        = string
  sensitive   = true
}

# --- Ory Project Configuration ---

resource "ory_project" "main" {
  id   = var.project_id
  name = "My Application"

  # CORS configuration
  cors_public {
    enabled = true
    origins = [
      var.app_url,
      "http://localhost:3000", # Local development
    ]
  }

  # Custom UI URLs
  selfservice_ui {
    login_url        = "${var.app_url}/auth/login"
    registration_url = "${var.app_url}/auth/registration"
    recovery_url     = "${var.app_url}/auth/recovery"
    verification_url = "${var.app_url}/auth/verification"
    settings_url     = "${var.app_url}/auth/settings"
    error_url        = "${var.app_url}/auth/error"
  }
}

# --- Identity Schema ---

resource "ory_identity_schema" "default" {
  project_id = var.project_id
  name       = "default"

  schema = jsonencode({
    "$id"     = "https://schemas.ory.sh/presets/kratos/identity.basic.schema.json"
    "$schema" = "http://json-schema.org/draft-07/schema#"
    title     = "User"
    type      = "object"
    properties = {
      traits = {
        type = "object"
        properties = {
          email = {
            type   = "string"
            format = "email"
            title  = "E-Mail"
            "ory.sh/kratos" = {
              credentials = {
                password = { identifier = true }
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

# --- OAuth2 Client (for your application) ---

resource "ory_oauth2_client" "app" {
  project_id = var.project_id

  client_name = "My Application"
  grant_types = ["authorization_code", "refresh_token"]
  response_types = ["code"]

  redirect_uris = [
    "${var.app_url}/api/auth/callback",
    "http://localhost:3000/api/auth/callback",
  ]

  post_logout_redirect_uris = [
    var.app_url,
  ]

  scope    = "openid offline_access email profile"
  audience = ["${var.app_url}"]

  token_endpoint_auth_method = "client_secret_post"

  # Access token settings
  access_token_strategy = "jwt"

  metadata = jsonencode({
    environment = "production"
    managed_by  = "terraform"
  })
}

# --- Ory Actions (Webhooks) ---

# Stripe integration — create customer on registration
resource "ory_action" "stripe_registration" {
  project_id = var.project_id
  flow       = "registration"
  hook       = "after"

  config = jsonencode({
    hook = "web_hook"
    config = {
      url    = "${var.webhook_base_url}/webhooks/stripe/registration"
      method = "POST"
      body   = base64encode(file("${path.module}/jsonnet/registration.jsonnet"))
      response = {
        parse  = true
        ignore = false
      }
      can_interrupt = false
      auth = {
        type = "api_key"
        config = {
          name  = "X-Webhook-Secret"
          value = var.webhook_secret
          in    = "header"
        }
      }
    }
  })
}

# Segment integration — track login events
resource "ory_action" "segment_login" {
  project_id = var.project_id
  flow       = "login"
  hook       = "after"

  config = jsonencode({
    hook = "web_hook"
    config = {
      url    = "${var.webhook_base_url}/webhooks/segment/login"
      method = "POST"
      body   = base64encode(file("${path.module}/jsonnet/login.jsonnet"))
      response = {
        ignore = true
      }
      can_interrupt = false
      auth = {
        type = "api_key"
        config = {
          name  = "X-Webhook-Secret"
          value = var.webhook_secret
          in    = "header"
        }
      }
    }
  })
}

# --- Outputs ---

output "oauth2_client_id" {
  description = "OAuth2 client ID for your application"
  value       = ory_oauth2_client.app.client_id
}

output "oauth2_client_secret" {
  description = "OAuth2 client secret (sensitive)"
  value       = ory_oauth2_client.app.client_secret
  sensitive   = true
}
