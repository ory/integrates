# Terraform Configuration for Ory Network
#
# This example manages Ory Network project configuration as code,
# including identity schemas, OAuth2 clients, and webhook actions.
#
# Prerequisites:
#   1. Export the provider credentials (store the keys in a secret manager,
#      not in .tfvars files):
#        export ORY_WORKSPACE_API_KEY="ory_wak_..."  # project config, schemas, actions
#        export ORY_PROJECT_API_KEY="ory_pat_..."    # OAuth2 clients, identities
#        export ORY_PROJECT_ID="<project-id>"
#        export ORY_PROJECT_SLUG="<project-slug>"
#   2. export TF_VAR_webhook_secret="<shared-webhook-secret>"
#   3. terraform init && terraform plan

terraform {
  required_version = ">= 1.5"
  required_providers {
    ory = {
      source  = "ory/ory"
      version = "~> 26.3"
    }
  }
}

# Reads ORY_WORKSPACE_API_KEY, ORY_PROJECT_API_KEY, ORY_PROJECT_ID, and
# ORY_PROJECT_SLUG from the environment.
provider "ory" {}

# --- Variables ---

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

resource "ory_project_config" "main" {
  cors_enabled = true
  cors_origins = [
    var.app_url,
    "http://localhost:3000", # Local development
  ]

  selfservice_flows_login_ui_url        = "${var.app_url}/auth/login"
  selfservice_flows_registration_ui_url = "${var.app_url}/auth/registration"
  selfservice_flows_recovery_ui_url     = "${var.app_url}/auth/recovery"
  selfservice_flows_verification_ui_url = "${var.app_url}/auth/verification"
  selfservice_flows_settings_ui_url     = "${var.app_url}/auth/settings"
  selfservice_flows_error_ui_url        = "${var.app_url}/auth/error"
}

# --- Identity Schema ---

resource "ory_identity_schema" "customer" {
  schema_id   = "customer"
  set_default = true

  schema = jsonencode({
    "$id"     = "https://example.com/schemas/customer.schema.json"
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
        required             = ["email"]
        additionalProperties = false
      }
    }
  })
}

# --- OAuth2 Client (for your application) ---

resource "ory_oauth2_client" "app" {
  client_name    = "My Application"
  grant_types    = ["authorization_code", "refresh_token"]
  response_types = ["code"]

  redirect_uris = [
    "${var.app_url}/api/auth/callback",
    "http://localhost:3000/api/auth/callback",
  ]

  post_logout_redirect_uris = [
    var.app_url,
  ]

  scope    = "openid offline_access email profile"
  audience = [var.app_url]

  token_endpoint_auth_method = "client_secret_post"
  access_token_strategy      = "jwt"

  metadata = jsonencode({
    environment = "production"
    managed_by  = "terraform"
  })
}

# --- Ory Actions (Webhooks) ---

# Stripe integration — create customer on registration
resource "ory_action" "stripe_registration" {
  flow           = "registration"
  timing         = "after"
  auth_method    = "password"
  url            = "${var.webhook_base_url}/webhooks/stripe/registration"
  method         = "POST"
  body           = file("${path.module}/jsonnet/registration.jsonnet")
  response_parse = true
  can_interrupt  = false

  webhook_auth_type          = "api_key"
  webhook_auth_api_key_name  = "X-Webhook-Secret"
  webhook_auth_api_key_value = var.webhook_secret
  webhook_auth_api_key_in    = "header"
}

# Segment integration — track login events
resource "ory_action" "segment_login" {
  flow            = "login"
  timing          = "after"
  auth_method     = "password"
  url             = "${var.webhook_base_url}/webhooks/segment/login"
  method          = "POST"
  body            = file("${path.module}/jsonnet/login.jsonnet")
  response_ignore = true
  can_interrupt   = false

  webhook_auth_type          = "api_key"
  webhook_auth_api_key_name  = "X-Webhook-Secret"
  webhook_auth_api_key_value = var.webhook_secret
  webhook_auth_api_key_in    = "header"
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
