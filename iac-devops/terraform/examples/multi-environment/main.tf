# Multi-Environment Terraform Configuration for Ory Network
#
# Manages separate Ory projects for staging and production
# using Terraform workspaces and separate .tfvars files.
#
# Export ORY_WORKSPACE_API_KEY (ory_wak_...) and TF_VAR_webhook_secret, then:
#   terraform workspace new staging
#   terraform apply -var-file=staging.tfvars
#
#   terraform workspace new production
#   terraform apply -var-file=production.tfvars

terraform {
  required_version = ">= 1.5"
  required_providers {
    ory = {
      source  = "ory/ory"
      version = "~> 26.3"
    }
  }

  # Remote state for team collaboration
  # backend "s3" {
  #   bucket = "your-terraform-state"
  #   key    = "ory/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "ory" {
  project_id = var.project_id
}

# --- Variables ---

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "project_id" {
  description = "Ory Network project ID"
  type        = string
}

variable "app_url" {
  description = "Application base URL"
  type        = string
}

variable "webhook_base_url" {
  description = "Webhook handler base URL"
  type        = string
}

variable "webhook_secret" {
  description = "Webhook authentication secret"
  type        = string
  sensitive   = true
}

variable "enable_stripe_webhook" {
  description = "Enable Stripe integration webhook"
  type        = bool
  default     = true
}

variable "enable_segment_webhook" {
  description = "Enable Segment analytics webhook"
  type        = bool
  default     = true
}

variable "enable_splunk_webhook" {
  description = "Enable Splunk SIEM webhook"
  type        = bool
  default     = false
}

# --- Locals ---

locals {
  is_production = var.environment == "production"

  # Only enable debug-friendly CORS origins in non-production
  cors_origins = concat(
    [var.app_url],
    local.is_production ? [] : ["http://localhost:3000", "http://localhost:4200"]
  )
}

# --- Project Configuration ---

resource "ory_project_config" "main" {
  cors_enabled = true
  cors_origins = local.cors_origins

  selfservice_flows_login_ui_url        = "${var.app_url}/auth/login"
  selfservice_flows_registration_ui_url = "${var.app_url}/auth/registration"
  selfservice_flows_recovery_ui_url     = "${var.app_url}/auth/recovery"
  selfservice_flows_verification_ui_url = "${var.app_url}/auth/verification"
  selfservice_flows_settings_ui_url     = "${var.app_url}/auth/settings"
  selfservice_flows_error_ui_url        = "${var.app_url}/auth/error"
}

# --- Conditional Webhooks ---

resource "ory_action" "stripe_registration" {
  count = var.enable_stripe_webhook ? 1 : 0

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

resource "ory_action" "segment_login" {
  count = var.enable_segment_webhook ? 1 : 0

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

resource "ory_action" "splunk_login" {
  count = var.enable_splunk_webhook ? 1 : 0

  flow            = "login"
  timing          = "after"
  auth_method     = "password"
  url             = "${var.webhook_base_url}/webhooks/splunk/login"
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

output "environment" {
  value = var.environment
}

output "webhooks_enabled" {
  value = {
    stripe  = var.enable_stripe_webhook
    segment = var.enable_segment_webhook
    splunk  = var.enable_splunk_webhook
  }
}
