# Hookdeck — Webhook Reliability Layer for Ory Network

Route Ory Network events through Hookdeck for reliable delivery, automatic retries, rate limiting, and observability.

## Overview

Hookdeck is a webhook infrastructure platform that sits between Ory Network and your consumer services. It provides reliable delivery, automatic retries, transformation, filtering, and full observability for all webhook events.

| Feature | Details |
|---------|---------|
| Platform | Hookdeck |
| Pattern | Ory -> Hookdeck (ingest URL) -> Consumer endpoints |
| Retry policy | Configurable (linear, exponential, or custom schedule) |
| Delivery guarantee | At-least-once |
| Extras | Filtering, transformation, rate limiting, event replay |
| Ory Platform | Ory Network (managed cloud) |

## Architecture

```
┌─────────────┐        ┌──────────────┐        ┌──────────────┐
│             │ webhook│              │ route  │              │
│  Ory Network├───────►│  Hookdeck    ├───────►│  Destination │
│             │        │  (Source)    │        │  Endpoints   │
└─────────────┘        └──────────────┘        └──────────────┘
                              │
                     ┌────────┼────────┐
                     │        │        │
                     ▼        ▼        ▼
               ┌─────────┐ ┌─────┐ ┌──────────┐
               │ Stripe  │ │ CRM │ │ Analytics│
               └─────────┘ └─────┘ └──────────┘
```

**Key difference from direct webhooks**: Hookdeck receives the webhook from Ory immediately (fast 200 response), then handles delivery to your destinations asynchronously with retries, rate limiting, and monitoring. Ory never sees a failed delivery.

## Prerequisites

- Ory Network project
- Hookdeck account (free tier available)
- Hookdeck CLI (`brew install hookdeck/hookdeck/hookdeck`)

## Step 1: Set Up Hookdeck

### Create Source and Connections via Dashboard

1. Go to [dashboard.hookdeck.com](https://dashboard.hookdeck.com)
2. Create a **Source** named `ory-network`
3. Copy the **Source URL** (e.g., `https://hk.hookdeck.com/e/src_abc123`)
4. Create **Connections** from this source to your destinations

### Or via Hookdeck CLI / API

```bash
# Create a source
hookdeck source create ory-network

# Create destinations
hookdeck destination create stripe-handler \
  --url "https://api.example.com/consumers/stripe"

hookdeck destination create crm-sync \
  --url "https://api.example.com/consumers/crm"

hookdeck destination create analytics \
  --url "https://api.example.com/consumers/analytics"

# Create connections (source -> destination with optional rules)
hookdeck connection create ory-to-stripe \
  --source ory-network \
  --destination stripe-handler

hookdeck connection create ory-to-crm \
  --source ory-network \
  --destination crm-sync

hookdeck connection create ory-to-analytics \
  --source ory-network \
  --destination analytics
```

### Or via the Hookdeck API

```bash
# Create a connection with filtering and retry config
curl -X POST https://api.hookdeck.com/2024-09-01/connections \
  -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ory-to-stripe",
    "source": {
      "name": "ory-network"
    },
    "destination": {
      "name": "stripe-handler",
      "url": "https://api.example.com/consumers/stripe"
    },
    "rules": [
      {
        "type": "filter",
        "body": {
          "event_type": { "$eq": "ory.identity.registered" }
        }
      },
      {
        "type": "retry",
        "strategy": "exponential",
        "count": 5,
        "interval": 30000
      }
    ]
  }'
```

## Step 2: Configure Ory Webhooks to Send to Hookdeck

Point your Ory webhooks at the Hookdeck source URL instead of your service directly.

### Jsonnet Templates

```jsonnet
// hooks/post-registration.jsonnet
function(ctx) {
  event_type: "ory.identity.registered",
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  traits: ctx.identity.traits,
  created_at: ctx.identity.created_at,
  schema_id: ctx.identity.schema_id,
}
```

```jsonnet
// hooks/post-login.jsonnet
function(ctx) {
  event_type: "ory.identity.logged_in",
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  session_id: ctx.session.id,
}
```

```jsonnet
// hooks/post-settings.jsonnet
function(ctx) {
  event_type: "ory.identity.updated",
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  traits: ctx.identity.traits,
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
                # Point directly to the Hookdeck source URL
                url: https://hk.hookdeck.com/e/src_abc123
                method: POST
                body: "file:///etc/config/kratos/hooks/post-registration.jsonnet"
                response:
                  ignore: true  # Hookdeck responds 200 immediately
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
                url: https://hk.hookdeck.com/e/src_abc123
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
                url: https://hk.hookdeck.com/e/src_abc123
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
```

Apply:

```bash
ory update identity-config <project-id> --file identity-config.yaml
```

## Step 3: Configure Connection Rules

### Filtering

Route events to specific destinations based on event type:

```bash
# Only registration events to Stripe
curl -X PUT "https://api.hookdeck.com/2024-09-01/connections/$CONNECTION_ID" \
  -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rules": [
      {
        "type": "filter",
        "body": {
          "event_type": { "$eq": "ory.identity.registered" }
        }
      }
    ]
  }'

# Registration and update events to CRM
curl -X PUT "https://api.hookdeck.com/2024-09-01/connections/$CONNECTION_ID" \
  -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rules": [
      {
        "type": "filter",
        "body": {
          "event_type": {
            "$in": ["ory.identity.registered", "ory.identity.updated"]
          }
        }
      }
    ]
  }'
```

### Transformation

Transform the Ory payload before delivering to a destination:

```javascript
// Hookdeck Transformation (configured in Dashboard or API)
// Transform Ory event to Stripe-compatible payload

addHandler("transform", (request, context) => {
  const { event_type, identity_id, email, traits } = request.body;

  request.body = {
    email: email,
    name:
      traits.name
        ? `${traits.name.first} ${traits.name.last}`.trim()
        : undefined,
    metadata: {
      ory_identity_id: identity_id,
      source: "ory-network",
    },
  };

  // Add custom header
  request.headers["X-Event-Type"] = event_type;

  return request;
});
```

### Retry Configuration

```bash
curl -X PUT "https://api.hookdeck.com/2024-09-01/connections/$CONNECTION_ID" \
  -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rules": [
      {
        "type": "retry",
        "strategy": "exponential",
        "count": 5,
        "interval": 30000
      }
    ]
  }'
```

Retry strategies:
- **linear**: Fixed interval between retries
- **exponential**: Doubling interval (30s, 60s, 120s, ...)
- **custom**: Define a specific schedule

### Rate Limiting

Protect your downstream services:

```bash
curl -X PUT "https://api.hookdeck.com/2024-09-01/connections/$CONNECTION_ID" \
  -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rules": [
      {
        "type": "rate_limit",
        "period": "second",
        "limit": 10
      }
    ]
  }'
```

### Delay

Add a delay before delivery (useful for eventual consistency):

```bash
curl -X PUT "https://api.hookdeck.com/2024-09-01/connections/$CONNECTION_ID" \
  -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rules": [
      {
        "type": "delay",
        "delay": 5000
      }
    ]
  }'
```

## Step 4: Source Verification

Configure Hookdeck to verify the webhook secret from Ory:

```bash
curl -X PUT "https://api.hookdeck.com/2024-09-01/sources/$SOURCE_ID" \
  -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "verification": {
      "type": "api_key",
      "configs": {
        "header_key": "X-Webhook-Secret",
        "api_key": "YOUR_WEBHOOK_SECRET"
      }
    }
  }'
```

## Local Development

Use the Hookdeck CLI to receive webhooks locally:

```bash
# Forward webhooks to your local server
hookdeck listen 3000 ory-network

# This gives you a URL like:
# https://hk.hookdeck.com/e/src_abc123
# All events sent to this URL will be forwarded to localhost:3000
```

## Consumer Endpoint Example

```javascript
// consumers/stripe.js
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.json());

app.post("/consumers/stripe", async (req, res) => {
  // Hookdeck forwards the original headers plus Hookdeck metadata
  // Verify Hookdeck signature if configured
  const hookdeckSignature = req.headers["x-hookdeck-signature"];

  const { identity_id, email, traits } = req.body;

  try {
    const customer = await stripe.customers.create({
      email,
      name: traits?.name
        ? `${traits.name.first} ${traits.name.last}`.trim()
        : undefined,
      metadata: { ory_identity_id: identity_id },
    });

    console.log(`Created Stripe customer: ${customer.id}`);
    return res.status(200).json({ customer_id: customer.id });
  } catch (err) {
    console.error("Failed:", err);
    // Return 5xx so Hookdeck retries
    return res.status(500).json({ error: err.message });
  }
});

app.listen(3000);
```

## Monitoring and Observability

### Hookdeck Dashboard

The Hookdeck Dashboard provides:

- **Event stream**: Real-time view of all incoming events
- **Delivery attempts**: Full history with request/response payloads
- **Filters**: Search by event type, status, destination, time range
- **Event replay**: Retry individual or bulk events
- **Metrics**: Success rate, latency, throughput per connection

### CLI Monitoring

```bash
# View recent events
hookdeck events list --source ory-network

# View delivery attempts for a specific event
hookdeck attempts list --event-id evt_abc123

# Retry a failed delivery
hookdeck attempts retry att_abc123

# Bulk retry failed deliveries
hookdeck events retry --source ory-network --status failed
```

### API Monitoring

```bash
# Get delivery statistics
curl "https://api.hookdeck.com/2024-09-01/events?source_id=$SOURCE_ID&status=failed" \
  -H "Authorization: Bearer $HOOKDECK_API_KEY"

# Retry all failed events in a time range
curl -X POST "https://api.hookdeck.com/2024-09-01/bulk/events/retry" \
  -H "Authorization: Bearer $HOOKDECK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "source_id": "'$SOURCE_ID'",
      "status": "failed",
      "created_at": { "$gte": "2024-12-01T00:00:00Z" }
    }
  }'
```

## Environment Variables

```bash
# .env (do not commit)
ORY_SDK_URL=https://your-project.projects.oryapis.com
ORY_API_KEY=ory_pat_...
ORY_WEBHOOK_SECRET=your-webhook-secret

HOOKDECK_API_KEY=hk_...

STRIPE_SECRET_KEY=sk_live_...

PORT=3000
```

## Hookdeck vs Direct Webhooks

| Feature | Direct Ory Webhook | Via Hookdeck |
|---------|-------------------|--------------|
| Delivery speed | Synchronous (blocks Ory flow) | Async (immediate 200 to Ory) |
| Retries | Limited (Ory-managed) | Configurable (up to days) |
| Fan-out | One URL per hook | Multiple destinations per source |
| Filtering | Jsonnet template | JSON path rules |
| Transformation | Jsonnet | JavaScript |
| Monitoring | Ory logs | Full dashboard with search |
| Replay | Not available | Per-event or bulk |
| Rate limiting | Not available | Per-connection |
| Local dev | ngrok/tunnel required | `hookdeck listen` |

## References

- [Hookdeck Documentation](https://hookdeck.com/docs)
- [Hookdeck API Reference](https://hookdeck.com/api-ref)
- [Hookdeck CLI](https://hookdeck.com/docs/cli)
- [Ory Webhooks Documentation](https://www.ory.sh/docs/guides/integrate-with-ory-cloud-through-webhooks)
