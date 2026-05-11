# Svix — Reliable Webhook Delivery for Ory Network

Route Ory Network events through Svix for reliable fan-out, automatic retries, and delivery monitoring.

## Overview

Svix is a webhook delivery platform that handles the operational complexity of sending webhooks reliably. This integration routes Ory Network events (registration, login, account changes) through Svix, which then fans out to multiple consumer endpoints with automatic retries, delivery monitoring, and failure alerting.

| Feature | Details |
|---------|---------|
| Platform | Svix |
| Pattern | Ory -> Your API -> Svix -> Consumer endpoints |
| Retry policy | Exponential backoff, configurable |
| Delivery guarantee | At-least-once |
| Monitoring | Svix Dashboard, API, webhooks |
| Ory Platform | Ory Network (managed cloud) |

## Architecture

```
┌─────────────┐        ┌──────────────┐        ┌──────────────┐
│             │ webhook│              │ fan-out │              │
│  Ory Network├───────►│  Your API    ├───────►│    Svix      │
│             │        │  (Router)    │        │              │
└─────────────┘        └──────────────┘        └──────┬───────┘
                                                      │
                              ┌────────────────┬──────┴───────┐
                              │                │              │
                              ▼                ▼              ▼
                        ┌──────────┐    ┌──────────┐   ┌──────────┐
                        │ Stripe   │    │ CRM      │   │ Analytics│
                        │ Customer │    │ Sync     │   │ Pipeline │
                        │ Creation │    │          │   │          │
                        └──────────┘    └──────────┘   └──────────┘
```

**Why add Svix between Ory and your consumers?**
- **Fan-out**: One Ory event triggers multiple downstream actions.
- **Retries**: Svix automatically retries failed deliveries with exponential backoff.
- **Monitoring**: Dashboard showing delivery status, latency, and failure rates.
- **Replay**: Re-send events that failed or were missed.
- **Signature verification**: Svix signs payloads so consumers can verify authenticity.

## Prerequisites

- Ory Network project
- Svix account and API key (or self-hosted Svix instance)
- Webhook router service (receives Ory events, sends to Svix)

## Step 1: Set Up Svix

### Create a Svix Application (per Ory project)

```bash
# Via Svix CLI
svix application create \
  --name "ory-production" \
  --uid "ory-project-<your-project-slug>"
```

Or via API:

```bash
curl -X POST https://api.svix.com/api/v1/app/ \
  -H "Authorization: Bearer $SVIX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ory-production",
    "uid": "ory-project-your-slug"
  }'
```

### Define Event Types

```bash
# Register event types in Svix
curl -X POST https://api.svix.com/api/v1/event-type/ \
  -H "Authorization: Bearer $SVIX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ory.identity.registered",
    "description": "New identity registered in Ory",
    "schemas": {
      "1": {
        "type": "object",
        "properties": {
          "identity_id": { "type": "string" },
          "email": { "type": "string" },
          "traits": { "type": "object" },
          "created_at": { "type": "string" }
        }
      }
    }
  }'

curl -X POST https://api.svix.com/api/v1/event-type/ \
  -H "Authorization: Bearer $SVIX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ory.identity.logged_in",
    "description": "Identity logged in to Ory",
    "schemas": {
      "1": {
        "type": "object",
        "properties": {
          "identity_id": { "type": "string" },
          "email": { "type": "string" },
          "session_id": { "type": "string" },
          "login_method": { "type": "string" }
        }
      }
    }
  }'

curl -X POST https://api.svix.com/api/v1/event-type/ \
  -H "Authorization: Bearer $SVIX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ory.identity.updated",
    "description": "Identity traits or settings changed",
    "schemas": {
      "1": {
        "type": "object",
        "properties": {
          "identity_id": { "type": "string" },
          "email": { "type": "string" },
          "changed_fields": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  }'

curl -X POST https://api.svix.com/api/v1/event-type/ \
  -H "Authorization: Bearer $SVIX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ory.identity.verified",
    "description": "Identity email/phone verified",
    "schemas": {
      "1": {
        "type": "object",
        "properties": {
          "identity_id": { "type": "string" },
          "email": { "type": "string" },
          "verified_at": { "type": "string" }
        }
      }
    }
  }'
```

### Add Consumer Endpoints

```bash
# Stripe customer creation endpoint
curl -X POST https://api.svix.com/api/v1/app/ory-project-your-slug/endpoint/ \
  -H "Authorization: Bearer $SVIX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.example.com/consumers/stripe",
    "version": 1,
    "filterTypes": ["ory.identity.registered"],
    "description": "Create Stripe customer on registration",
    "rateLimit": 100
  }'

# CRM sync endpoint
curl -X POST https://api.svix.com/api/v1/app/ory-project-your-slug/endpoint/ \
  -H "Authorization: Bearer $SVIX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.example.com/consumers/crm",
    "version": 1,
    "filterTypes": [
      "ory.identity.registered",
      "ory.identity.updated",
      "ory.identity.verified"
    ],
    "description": "Sync identity data to CRM"
  }'

# Analytics pipeline
curl -X POST https://api.svix.com/api/v1/app/ory-project-your-slug/endpoint/ \
  -H "Authorization: Bearer $SVIX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.example.com/consumers/analytics",
    "version": 1,
    "description": "All Ory events to analytics pipeline"
  }'
```

## Step 2: Configure Ory Webhooks

### Jsonnet Templates

```jsonnet
// hooks/post-registration.jsonnet
function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  traits: ctx.identity.traits,
  created_at: ctx.identity.created_at,
  event_type: "ory.identity.registered",
}
```

```jsonnet
// hooks/post-login.jsonnet
function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  session_id: ctx.session.id,
  event_type: "ory.identity.logged_in",
}
```

```jsonnet
// hooks/post-settings.jsonnet
function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  event_type: "ory.identity.updated",
}
```

```jsonnet
// hooks/post-verification.jsonnet
function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.verifiable_addresses[0].value,
  verified_at: ctx.identity.verifiable_addresses[0].verified_at,
  event_type: "ory.identity.verified",
}
```

### Ory Project Configuration

```yaml
# identity-config.yaml
selfservice:
  flows:
    registration:
      after:
        password:
          hooks:
            - hook: session
            - hook: web_hook
              config:
                url: https://api.example.com/hooks/ory/event
                method: POST
                body: "file:///etc/config/kratos/hooks/post-registration.jsonnet"
                response:
                  ignore: true
                auth:
                  type: api_key
                  config:
                    name: X-Webhook-Secret
                    value: YOUR_WEBHOOK_SECRET
                    in: header

    login:
      after:
        password:
          hooks:
            - hook: web_hook
              config:
                url: https://api.example.com/hooks/ory/event
                method: POST
                body: "file:///etc/config/kratos/hooks/post-login.jsonnet"
                response:
                  ignore: true
                auth:
                  type: api_key
                  config:
                    name: X-Webhook-Secret
                    value: YOUR_WEBHOOK_SECRET
                    in: header

    settings:
      after:
        profile:
          hooks:
            - hook: web_hook
              config:
                url: https://api.example.com/hooks/ory/event
                method: POST
                body: "file:///etc/config/kratos/hooks/post-settings.jsonnet"
                response:
                  ignore: true
                auth:
                  type: api_key
                  config:
                    name: X-Webhook-Secret
                    value: YOUR_WEBHOOK_SECRET
                    in: header

    verification:
      after:
        hooks:
          - hook: web_hook
            config:
              url: https://api.example.com/hooks/ory/event
              method: POST
              body: "file:///etc/config/kratos/hooks/post-verification.jsonnet"
              response:
                ignore: true
              auth:
                type: api_key
                config:
                  name: X-Webhook-Secret
                  value: YOUR_WEBHOOK_SECRET
                  in: header
```

## Step 3: Event Router Service

This service receives Ory webhook events and sends them to Svix for fan-out.

```javascript
// server.js
const express = require("express");
const { Svix } = require("svix");

const app = express();
app.use(express.json());

const svix = new Svix(process.env.SVIX_API_KEY);
const SVIX_APP_ID = process.env.SVIX_APP_ID || "ory-project-your-slug";

// Single endpoint for all Ory events
app.post("/hooks/ory/event", async (req, res) => {
  // Verify Ory webhook secret
  const secret = req.headers["x-webhook-secret"];
  if (secret !== process.env.ORY_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  const { event_type, ...payload } = req.body;

  if (!event_type) {
    return res.status(400).json({ error: "Missing event_type" });
  }

  try {
    // Send to Svix for fan-out
    const message = await svix.message.create(SVIX_APP_ID, {
      eventType: event_type,
      payload: {
        ...payload,
        timestamp: new Date().toISOString(),
      },
      // Optional: idempotency key to prevent duplicates
      eventId: `${event_type}-${payload.identity_id}-${Date.now()}`,
    });

    console.log(
      `Sent ${event_type} to Svix: message ${message.id}`
    );

    return res.status(200).json({ received: true, svix_message_id: message.id });
  } catch (err) {
    console.error("Svix send failed:", err);
    // Return 200 to avoid Ory retrying (handle retries at the Svix layer)
    return res.status(200).json({ received: true, error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Event router running on port", process.env.PORT || 3000);
});
```

### Consumer Endpoint Example (Stripe)

```javascript
// consumers/stripe.js
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { Webhook } = require("svix");

const app = express();
app.use(express.json());

app.post("/consumers/stripe", async (req, res) => {
  // Verify Svix signature
  const wh = new Webhook(process.env.SVIX_WEBHOOK_SECRET);
  try {
    wh.verify(JSON.stringify(req.body), {
      "svix-id": req.headers["svix-id"],
      "svix-timestamp": req.headers["svix-timestamp"],
      "svix-signature": req.headers["svix-signature"],
    });
  } catch (err) {
    return res.status(401).json({ error: "Invalid Svix signature" });
  }

  const { identity_id, email, traits } = req.body;

  try {
    const customer = await stripe.customers.create({
      email,
      name: traits.name
        ? `${traits.name.first} ${traits.name.last}`.trim()
        : undefined,
      metadata: { ory_identity_id: identity_id },
    });

    console.log(`Created Stripe customer: ${customer.id}`);
    return res.status(200).json({ customer_id: customer.id });
  } catch (err) {
    console.error("Stripe customer creation failed:", err);
    return res.status(500).json({ error: err.message });
  }
});
```

### package.json

```json
{
  "name": "ory-svix-integration",
  "version": "1.0.0",
  "dependencies": {
    "@ory/client": "^1.0.0",
    "express": "^4.18.0",
    "svix": "^1.0.0",
    "stripe": "^14.0.0"
  }
}
```

### Environment Variables

```bash
# .env (do not commit)
ORY_SDK_URL=https://your-project.projects.oryapis.com
ORY_API_KEY=ory_pat_...
ORY_WEBHOOK_SECRET=your-ory-webhook-secret

SVIX_API_KEY=sk_...
SVIX_APP_ID=ory-project-your-slug

STRIPE_SECRET_KEY=sk_live_...

PORT=3000
```

## Svix Dashboard Features

Once configured, the Svix Dashboard provides:

- **Message browser**: View all sent events with payload inspection
- **Endpoint health**: Delivery success rate per consumer endpoint
- **Retry status**: See which deliveries are being retried
- **Event replay**: Re-send individual events or bulk replay
- **Logs**: Full delivery attempt logs with response bodies
- **Alerts**: Configure alerts for delivery failures

## Monitoring and Observability

### Check Endpoint Health

```bash
curl https://api.svix.com/api/v1/app/$SVIX_APP_ID/endpoint/$ENDPOINT_ID/stats/ \
  -H "Authorization: Bearer $SVIX_API_KEY"
```

### List Failed Messages

```bash
curl "https://api.svix.com/api/v1/app/$SVIX_APP_ID/msg/?status=failed" \
  -H "Authorization: Bearer $SVIX_API_KEY"
```

### Replay Failed Messages

```bash
curl -X POST "https://api.svix.com/api/v1/app/$SVIX_APP_ID/endpoint/$ENDPOINT_ID/replay-missing/" \
  -H "Authorization: Bearer $SVIX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"since": "2024-12-01T00:00:00Z"}'
```

## Retry Configuration

Svix uses exponential backoff by default. Customize per endpoint:

```bash
curl -X PUT "https://api.svix.com/api/v1/app/$SVIX_APP_ID/endpoint/$ENDPOINT_ID/" \
  -H "Authorization: Bearer $SVIX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.example.com/consumers/stripe",
    "rateLimit": 100,
    "metadata": {
      "retry_schedule": "exponential"
    }
  }'
```

Default retry schedule: attempts at 5s, 5m, 30m, 2h, 5h, 10h, and 10h intervals.

## References

- [Svix Documentation](https://docs.svix.com/)
- [Svix API Reference](https://api.svix.com/docs)
- [Svix Node.js SDK](https://github.com/svix/svix-webhooks/tree/main/javascript)
- [Ory Webhooks Documentation](https://www.ory.sh/docs/guides/integrate-with-ory-cloud-through-webhooks)
