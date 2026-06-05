# Stripe Integration for Ory Network

Bidirectional integration between Ory Network and Stripe for customer lifecycle management and subscription-aware authentication.

**Docs page:** [ory.com/docs/integrates-with/payment-billing/stripe](https://www.ory.com/docs/integrates-with/payment-billing/stripe)

## Overview

This integration connects Ory Network identity events with Stripe's billing platform in both directions:

- **Ory to Stripe**: Post-registration webhook creates a Stripe Customer. Post-login webhook enriches the session with subscription status.
- **Stripe to Ory**: Stripe webhooks update Ory identity metadata when subscription status changes.

| Feature | Details |
|---------|---------|
| Platform | Stripe |
| Direction | Bidirectional |
| Ory Events | Registration, Login |
| Stripe Events | `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` |
| Ory Platform | Ory Network (managed cloud) |

## Architecture

```
┌─────────────┐                    ┌──────────────┐
│             │  post-registration │              │
│  Ory Network├───────────────────►│  Your API    │
│  (Identity) │  post-login        │  (Webhook    │
│             │◄───────────────────┤   Handler)   │
│             │  session enrichment│              │
└──────┬──────┘                    └──────┬───────┘
       │                                  │
       │  Update identity metadata        │  Create customer
       │  (subscription status)           │  Fetch subscription
       │                                  │
       │                                  ▼
       │                           ┌──────────────┐
       │     Stripe webhooks       │              │
       └◄──────────────────────────┤    Stripe    │
                                   │              │
                                   └──────────────┘
```

## Prerequisites

- Ory Network project
- Stripe account with API keys
- Webhook handler service (Node.js example provided)

## Part 1: Ory to Stripe (Customer Creation on Registration)

### Step 1: Configure the Ory Webhook

In the Ory Console or via the CLI, add a post-registration webhook.

#### Ory Console Configuration

Navigate to **Ory Console > Identity > Hooks & Webhooks > After Registration** and add a webhook:

| Field | Value |
|-------|-------|
| URL | `https://api.example.com/hooks/ory/registration` |
| Method | `POST` |
| Auth | API Key (header: `X-Webhook-Secret`) |
| Parse Response | Yes |

#### Ory CLI Configuration

```bash
ory patch identity-config <project-id> \
  --add '/selfservice/flows/registration/after/password/hooks/-={"hook":"web_hook","config":{"url":"https://api.example.com/hooks/ory/registration","method":"POST","body":"base64://JSONNET_BASE64","response":{"ignore":false,"parse":true},"auth":{"type":"api_key","config":{"name":"X-Webhook-Secret","value":"YOUR_WEBHOOK_SECRET","in":"header"}}}}'
```

### Step 2: Jsonnet Template (Post-Registration)

```jsonnet
// hooks/post-registration.jsonnet
function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  name: {
    first: if std.objectHas(ctx.identity.traits, "name") then
      ctx.identity.traits.name.first
    else "",
    last: if std.objectHas(ctx.identity.traits, "name") then
      ctx.identity.traits.name.last
    else "",
  },
  event: "registration",
}
```

### Step 3: Webhook Handler (Registration)

```javascript
// handlers/registration.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { OryClient } = require("@ory/client");

const ory = new OryClient({
  basePath: process.env.ORY_SDK_URL,
  accessToken: process.env.ORY_API_KEY,
});

async function handleRegistration(req, res) {
  // Verify webhook secret
  const secret = req.headers["x-webhook-secret"];
  if (secret !== process.env.ORY_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  const { identity_id, email, name } = req.body;

  try {
    // 1. Create Stripe customer
    const customer = await stripe.customers.create({
      email: email,
      name: `${name.first} ${name.last}`.trim() || undefined,
      metadata: {
        ory_identity_id: identity_id,
      },
    });

    console.log(
      `Created Stripe customer ${customer.id} for identity ${identity_id}`
    );

    // 2. Update Ory identity metadata with Stripe customer ID
    const { data: identity } = await ory.identity.getIdentity({
      id: identity_id,
    });

    await ory.identity.updateIdentity({
      id: identity_id,
      updateIdentityBody: {
        schema_id: identity.schema_id,
        traits: identity.traits,
        metadata_public: {
          ...identity.metadata_public,
          stripe_customer_id: customer.id,
          subscription_status: "none",
          subscription_plan: null,
        },
        metadata_admin: {
          ...identity.metadata_admin,
          stripe_customer_id: customer.id,
        },
      },
    });

    // 3. Return response (Ory will merge into identity if parse=true)
    return res.status(200).json({
      identity: {
        metadata_public: {
          stripe_customer_id: customer.id,
          subscription_status: "none",
        },
      },
    });
  } catch (err) {
    console.error("Registration hook failed:", err);
    // Return 200 to avoid blocking registration, but log the error
    return res.status(200).json({});
  }
}

module.exports = { handleRegistration };
```

## Part 2: Session Enrichment (Subscription Status on Login)

### Step 1: Configure the Ory Login Webhook

Add a post-login webhook that enriches the session with the user's current subscription status.

#### Jsonnet Template (Post-Login)

```jsonnet
// hooks/post-login.jsonnet
function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  stripe_customer_id:
    if std.objectHas(ctx.identity, "metadata_public")
       && ctx.identity.metadata_public != null
       && std.objectHas(ctx.identity.metadata_public, "stripe_customer_id")
    then ctx.identity.metadata_public.stripe_customer_id
    else null,
  session_id: ctx.session.id,
  event: "login",
}
```

### Step 2: Webhook Handler (Login)

```javascript
// handlers/login.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

async function handleLogin(req, res) {
  const secret = req.headers["x-webhook-secret"];
  if (secret !== process.env.ORY_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  const { identity_id, stripe_customer_id } = req.body;

  if (!stripe_customer_id) {
    // No Stripe customer — return default metadata
    return res.status(200).json({
      identity: {
        metadata_public: {
          subscription_status: "none",
          subscription_plan: null,
          subscription_current_period_end: null,
        },
      },
    });
  }

  try {
    // Fetch active subscriptions from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: stripe_customer_id,
      status: "all",
      limit: 1,
      expand: ["data.items.data.price.product"],
    });

    let subscriptionData = {
      subscription_status: "none",
      subscription_plan: null,
      subscription_id: null,
      subscription_current_period_end: null,
    };

    if (subscriptions.data.length > 0) {
      const sub = subscriptions.data[0];
      const product = sub.items.data[0]?.price?.product;

      subscriptionData = {
        subscription_status: sub.status, // active, trialing, past_due, etc.
        subscription_plan: product?.name || sub.items.data[0]?.price?.id,
        subscription_id: sub.id,
        subscription_current_period_end: new Date(
          sub.current_period_end * 1000
        ).toISOString(),
      };
    }

    // Return enriched metadata (Ory merges this into the session)
    return res.status(200).json({
      identity: {
        metadata_public: {
          stripe_customer_id,
          ...subscriptionData,
        },
      },
    });
  } catch (err) {
    console.error("Login hook failed:", err);
    return res.status(200).json({});
  }
}

module.exports = { handleLogin };
```

## Part 3: Stripe to Ory (Subscription Status Sync)

### Step 1: Configure Stripe Webhook

In the Stripe Dashboard under **Developers > Webhooks**, add an endpoint:

| Field | Value |
|-------|-------|
| Endpoint URL | `https://api.example.com/hooks/stripe/subscription` |
| Events | `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` |

### Step 2: Webhook Handler (Stripe to Ory)

```javascript
// handlers/stripe-webhook.js
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { OryClient } = require("@ory/client");

const ory = new OryClient({
  basePath: process.env.ORY_SDK_URL,
  accessToken: process.env.ORY_API_KEY,
});

async function handleStripeWebhook(req, res) {
  // 1. Verify Stripe webhook signature
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody, // Requires raw body middleware
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Stripe signature verification failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  // 2. Extract the Ory identity ID from Stripe customer metadata
  let customerId;
  let subscriptionData = {};

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      customerId = subscription.customer;

      // Fetch the product name for the plan
      let planName = null;
      if (subscription.items?.data?.[0]?.price) {
        try {
          const price = await stripe.prices.retrieve(
            subscription.items.data[0].price.id,
            { expand: ["product"] }
          );
          planName = price.product?.name || price.id;
        } catch {
          planName = subscription.items.data[0].price.id;
        }
      }

      subscriptionData = {
        subscription_status: subscription.status,
        subscription_plan: planName,
        subscription_id: subscription.id,
        subscription_current_period_end: new Date(
          subscription.current_period_end * 1000
        ).toISOString(),
      };
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object;
      customerId = invoice.customer;
      // Refresh subscription data after successful payment
      if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          invoice.subscription
        );
        subscriptionData = {
          subscription_status: subscription.status,
          last_payment_date: new Date(
            invoice.status_transitions.paid_at * 1000
          ).toISOString(),
        };
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      customerId = invoice.customer;
      subscriptionData = {
        subscription_status: "payment_failed",
        last_payment_failure: new Date().toISOString(),
      };
      break;
    }

    default:
      return res.status(200).json({ received: true });
  }

  // 3. Look up the Ory identity by Stripe customer ID
  try {
    const customer = await stripe.customers.retrieve(customerId);
    const oryIdentityId = customer.metadata?.ory_identity_id;

    if (!oryIdentityId) {
      console.warn(`No Ory identity ID in Stripe customer ${customerId}`);
      return res.status(200).json({ received: true });
    }

    // 4. Update Ory identity metadata
    const { data: identity } = await ory.identity.getIdentity({
      id: oryIdentityId,
    });

    await ory.identity.updateIdentity({
      id: oryIdentityId,
      updateIdentityBody: {
        schema_id: identity.schema_id,
        traits: identity.traits,
        metadata_public: {
          ...identity.metadata_public,
          stripe_customer_id: customerId,
          ...subscriptionData,
          last_synced: new Date().toISOString(),
        },
        metadata_admin: identity.metadata_admin,
      },
    });

    console.log(
      `Updated identity ${oryIdentityId} with subscription status: ${subscriptionData.subscription_status}`
    );

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Stripe webhook handler failed:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

module.exports = { handleStripeWebhook };
```

## Full Server Example

```javascript
// server.js
const express = require("express");
const { handleRegistration } = require("./handlers/registration");
const { handleLogin } = require("./handlers/login");
const { handleStripeWebhook } = require("./handlers/stripe-webhook");

const app = express();

// Stripe webhook needs raw body for signature verification
app.post(
  "/hooks/stripe/subscription",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    req.rawBody = req.body;
    req.body = JSON.parse(req.body);
    next();
  },
  handleStripeWebhook
);

// Ory webhooks use JSON
app.use(express.json());

app.post("/hooks/ory/registration", handleRegistration);
app.post("/hooks/ory/login", handleLogin);

app.listen(process.env.PORT || 3000, () => {
  console.log("Webhook handler running on port", process.env.PORT || 3000);
});
```

### package.json

```json
{
  "name": "ory-stripe-integration",
  "version": "1.0.0",
  "dependencies": {
    "@ory/client": "^1.0.0",
    "express": "^4.18.0",
    "stripe": "^14.0.0"
  }
}
```

### Environment Variables

```bash
# .env (do not commit)
ORY_SDK_URL=https://your-project.projects.oryapis.com
ORY_API_KEY=ory_pat_...
ORY_WEBHOOK_SECRET=your-webhook-secret

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

PORT=3000
```

## Ory Project Configuration (YAML)

Full Ory identity configuration with both webhooks:

```yaml
# identity-config.yaml
selfservice:
  default_browser_return_url: https://app.example.com/

  flows:
    registration:
      ui_url: https://app.example.com/register
      after:
        password:
          hooks:
            - hook: session
            - hook: show_verification_ui
            - hook: web_hook
              config:
                url: https://api.example.com/hooks/ory/registration
                method: POST
                body: "base64://ZnVuY3Rpb24oY3R4KSB7CiAgaWRlbnRpdHlfaWQ6IGN0eC5pZGVudGl0eS5pZCwKICBlbWFpbDogY3R4LmlkZW50aXR5LnRyYWl0cy5lbWFpbCwKICBuYW1lOiB7CiAgICBmaXJzdDogaWYgc3RkLm9iamVjdEhhcyhjdHguaWRlbnRpdHkudHJhaXRzLCAibmFtZSIpIHRoZW4KICAgICAgY3R4LmlkZW50aXR5LnRyYWl0cy5uYW1lLmZpcnN0CiAgICBlbHNlICIiLAogICAgbGFzdDogaWYgc3RkLm9iamVjdEhhcyhjdHguaWRlbnRpdHkudHJhaXRzLCAibmFtZSIpIHRoZW4KICAgICAgY3R4LmlkZW50aXR5LnRyYWl0cy5uYW1lLmxhc3QKICAgIGVsc2UgIiIsCiAgfSwKICBldmVudDogInJlZ2lzdHJhdGlvbiIsCn0="
                response:
                  ignore: false
                  parse: true
                auth:
                  type: api_key
                  config:
                    name: X-Webhook-Secret
                    value: YOUR_WEBHOOK_SECRET
                    in: header

    login:
      ui_url: https://app.example.com/login
      after:
        password:
          hooks:
            - hook: web_hook
              config:
                url: https://api.example.com/hooks/ory/login
                method: POST
                body: "base64://ZnVuY3Rpb24oY3R4KSB7CiAgaWRlbnRpdHlfaWQ6IGN0eC5pZGVudGl0eS5pZCwKICBlbWFpbDogY3R4LmlkZW50aXR5LnRyYWl0cy5lbWFpbCwKICBzdHJpcGVfY3VzdG9tZXJfaWQ6CiAgICBpZiBzdGQub2JqZWN0SGFzKGN0eC5pZGVudGl0eSwgIm1ldGFkYXRhX3B1YmxpYyIpCiAgICAgICAmJiBjdHguaWRlbnRpdHkubWV0YWRhdGFfcHVibGljICE9IG51bGwKICAgICAgICYmIHN0ZC5vYmplY3RIYXMoY3R4LmlkZW50aXR5Lm1ldGFkYXRhX3B1YmxpYywgInN0cmlwZV9jdXN0b21lcl9pZCIpCiAgICB0aGVuIGN0eC5pZGVudGl0eS5tZXRhZGF0YV9wdWJsaWMuc3RyaXBlX2N1c3RvbWVyX2lkCiAgICBlbHNlIG51bGwsCiAgc2Vzc2lvbl9pZDogY3R4LnNlc3Npb24uaWQsCiAgZXZlbnQ6ICJsb2dpbiIsCn0="
                response:
                  ignore: false
                  parse: true
                auth:
                  type: api_key
                  config:
                    name: X-Webhook-Secret
                    value: YOUR_WEBHOOK_SECRET
                    in: header
```

Apply with the Ory CLI:

```bash
ory update identity-config <project-id> --file identity-config.yaml
```

## Example API Payloads

### Ory Post-Registration Webhook Payload (sent to your handler)

```json
{
  "identity_id": "7a3b1c2d-4e5f-6789-abcd-ef0123456789",
  "email": "user@example.com",
  "name": {
    "first": "Jane",
    "last": "Doe"
  },
  "event": "registration"
}
```

### Webhook Response (returned to Ory, merged into identity)

```json
{
  "identity": {
    "metadata_public": {
      "stripe_customer_id": "cus_Abc123Def456",
      "subscription_status": "none"
    }
  }
}
```

### Stripe Subscription Event Payload (sent by Stripe)

```json
{
  "id": "evt_1234567890",
  "type": "customer.subscription.updated",
  "data": {
    "object": {
      "id": "sub_Xyz789",
      "customer": "cus_Abc123Def456",
      "status": "active",
      "current_period_end": 1735689600,
      "items": {
        "data": [
          {
            "price": {
              "id": "price_Pro100",
              "product": "prod_ProPlan"
            }
          }
        ]
      }
    }
  }
}
```

### Identity Metadata After Full Sync

```json
{
  "metadata_public": {
    "stripe_customer_id": "cus_Abc123Def456",
    "subscription_status": "active",
    "subscription_plan": "Pro Plan",
    "subscription_id": "sub_Xyz789",
    "subscription_current_period_end": "2025-01-01T00:00:00.000Z",
    "last_synced": "2024-12-15T10:30:00.000Z"
  }
}
```

## Accessing Subscription Data in Your App

Once configured, subscription data is available in the Ory session:

```javascript
// Frontend: check subscription status from Ory session
const session = await ory.toSession();

const subscriptionStatus =
  session.identity.metadata_public?.subscription_status;
const plan = session.identity.metadata_public?.subscription_plan;

if (subscriptionStatus === "active" && plan === "Pro Plan") {
  // Show pro features
}
```

```javascript
// Backend: read from X-User-Metadata header (if using edge proxy)
app.get("/api/premium-feature", (req, res) => {
  const metadata = JSON.parse(req.headers["x-user-metadata"] || "{}");

  if (metadata.subscription_status !== "active") {
    return res.status(403).json({ error: "Active subscription required" });
  }

  // Serve premium content
});
```

## Troubleshooting

| Issue | Solution |
|-------|---------|
| Stripe customer not created | Check webhook handler logs; verify `ORY_WEBHOOK_SECRET` matches |
| Subscription status stale | Stripe webhook endpoint may be failing; check Stripe Dashboard > Webhooks |
| `metadata_public` empty | Ensure webhook response format matches `{identity: {metadata_public: {...}}}` |
| Stripe signature invalid | Ensure you pass the raw request body (not parsed JSON) to `constructEvent` |
| Duplicate Stripe customers | Add idempotency: check if `stripe_customer_id` exists in metadata before creating |

## References

- [Ory Webhooks Documentation](https://www.ory.sh/docs/guides/integrate-with-ory-cloud-through-webhooks)
- [Ory Jsonnet Data Mapping](https://www.ory.sh/docs/kratos/hooks/configure-hooks)
- [Stripe Customer API](https://docs.stripe.com/api/customers)
- [Stripe Webhooks](https://docs.stripe.com/webhooks)
- [Stripe Subscription Lifecycle](https://docs.stripe.com/billing/subscriptions/overview)
