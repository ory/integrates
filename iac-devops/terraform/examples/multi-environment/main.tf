# Multi-Environment Terraform Configuration for Ory Network
#
# Manages separate Ory projects for staging and production
# using Terraform workspaces or separate .tfvars files.
#
# Usage:
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
      version = "~> 0.1"
    }
  }

  # Remote state for team collaboration
  # backend "s3" {
  #   bucket = "your-terraform-state"
  #   key    = "ory/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "ory" {}

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
  project_name  = "MyApp - ${title(var.environment)}"

  # Only enable debug-friendly CORS origins in non-production
  cors_origins = concat(
    [var.app_url],
    local.is_production ? [] : ["http://localhost:3000", "http://localhost:4200"]
  )
}

# --- Project ---

resource "ory_project" "main" {
  id   = var.project_id
  name = local.project_name

  cors_public {
    enabled = true
    origins = local.cors_origins
  }

  selfservice_ui {
    login_url        = "${var.app_url}/auth/login"
    registration_url = "${var.app_url}/auth/registration"
    recovery_url     = "${var.app_url}/auth/recovery"
    verification_url = "${var.app_url}/auth/verification"
    settings_url     = "${var.app_url}/auth/settings"
    error_url        = "${var.app_url}/auth/error"
  }
}

# --- Conditional Webhooks ---

resource "ory_action" "stripe_registration" {
  count      = var.enable_stripe_webhook ? 1 : 0
  project_id = var.project_id
  flow       = "registration"
  hook       = "after"

  config = jsonencode({
    hook = "web_hook"
    config = {
      url    = "${var.webhook_base_url}/webhooks/stripe/registration"
      method = "POST"
      response = { parse = true, ignore = false }
      can_interrupt = false
      auth = {
        type = "api_key"
        config = {
          name = "X-Webhook-Secret"
          value = var.webhook_secret
          in = "header"
        }
      }
    }
  })
}

resource "ory_action" "segment_login" {
  count      = var.enable_segment_webhook ? 1 : 0
  project_id = var.project_id
  flow       = "login"
  hook       = "after"

  config = jsonencode({
    hook = "web_hook"
    config = {
      url    = "${var.webhook_base_url}/webhooks/segment/login"
      method = "POST"
      response = { ignore = true }
      can_interrupt = false
      auth = {
        type = "api_key"
        config = {
          name = "X-Webhook-Secret"
          value = var.webhook_secret
          in = "header"
        }
      }
    }
  })
}

resource "ory_action" "splunk_login" {
  count      = var.enable_splunk_webhook ? 1 : 0
  project_id = var.project_id
  flow       = "login"
  hook       = "after"

  config = jsonencode({
    hook = "web_hook"
    config = {
      url    = "${var.webhook_base_url}/webhooks/splunk/login"
      method = "POST"
      response = { ignore = true }
      can_interrupt = false
      auth = {
        type = "api_key"
        config = {
          name = "X-Webhook-Secret"
          value = var.webhook_secret
          in = "header"
        }
      }
    }
  })
}

# --- Outputs ---

output "project_name" {
  value = local.project_name
}

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
