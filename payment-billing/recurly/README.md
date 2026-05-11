# Recurly Integration for Ory Network

Bidirectional integration between Ory Network and Recurly for subscriber management and subscription-aware authentication.

## Overview

This integration connects Ory Network identity events with Recurly's subscription billing platform:

- **Ory to Recurly**: Post-registration webhook creates a Recurly Account. Post-login webhook enriches the session with subscription status.
- **Recurly to Ory**: Recurly webhooks update Ory identity metadata when subscription status changes.

| Feature | Details |
|---------|---------|
| Platform | Recurly |
| Direction | Bidirectional |
| Ory Events | Registration, Login |
| Recurly Events | `new_subscription_notification`, `updated_subscription_notification`, `expired_subscription_notification`, `renewed_subscription_notification`, `failed_payment_notification` |
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
       │  Update identity metadata        │  Create account
       │  (subscription status)           │  Fetch subscriptions
       │                                  │
       │                                  ▼
       │                           ┌──────────────┐
       │     Recurly webhooks      │              │
       └◄──────────────────────────┤   Recurly    │
                                   │              │
                                   └──────────────┘
```

## Prerequisites

- Ory Network project
- Recurly account with API key (v3)
- Webhook handler service (Node.js example provided)

## Part 1: Ory to Recurly (Account Creation on Registration)

### Step 1: Jsonnet Template (Post-Registration)

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

### Step 2: Ory Webhook Configuration

```yaml
# identity-config.yaml (relevant section)
selfservice:
  flows:
    registration:
      after:
        password:
          hooks:
            - hook: session
            - hook: web_hook
              config:
                url: https://api.example.com/hooks/ory/registration
                method: POST
                body: "file:///etc/config/kratos/hooks/post-registration.jsonnet"
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
      after:
        password:
          hooks:
            - hook: web_hook
              config:
                url: https://api.example.com/hooks/ory/login
                method: POST
                body: "file:///etc/config/kratos/hooks/post-login.jsonnet"
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

Apply via the Ory CLI:

```bash
ory update identity-config <project-id> --file identity-config.yaml
```

### Step 3: Webhook Handler (Registration)

```javascript
// handlers/registration.js
const recurly = require("recurly");

const client = new recurly.Client(process.env.RECURLY_API_KEY);
const { OryClient } = require("@ory/client");

const ory = new OryClient({
  basePath: process.env.ORY_SDK_URL,
  accessToken: process.env.ORY_API_KEY,
});

async function handleRegistration(req, res) {
  const secret = req.headers["x-webhook-secret"];
  if (secret !== process.env.ORY_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  const { identity_id, email, name } = req.body;

  try {
    // 1. Create Recurly account
    const accountCreate = {
      code: identity_id, // Use Ory identity ID as Recurly account code
      email: email,
      firstName: name.first || undefined,
      lastName: name.last || undefined,
      customFields: [
        {
          name: "ory_identity_id",
          value: identity_id,
        },
      ],
    };

    const account = await client.createAccount(accountCreate);

    console.log(
      `Created Recurly account ${account.code} for identity ${identity_id}`
    );

    // 2. Update Ory identity metadata
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
          recurly_account_code: account.code,
          recurly_account_id: account.id,
          subscription_status: "none",
          subscription_plan: null,
        },
        metadata_admin: {
          ...identity.metadata_admin,
          recurly_account_id: account.id,
        },
      },
    });

    return res.status(200).json({
      identity: {
        metadata_public: {
          recurly_account_code: account.code,
          recurly_account_id: account.id,
          subscription_status: "none",
        },
      },
    });
  } catch (err) {
    if (err instanceof recurly.errors.ValidationError) {
      console.error("Recurly validation error:", err.message);
    } else {
      console.error("Registration hook failed:", err);
    }
    return res.status(200).json({});
  }
}

module.exports = { handleRegistration };
```

## Part 2: Session Enrichment (Subscription Status on Login)

### Jsonnet Template (Post-Login)

```jsonnet
// hooks/post-login.jsonnet
function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  recurly_account_code:
    if std.objectHas(ctx.identity, "metadata_public")
       && ctx.identity.metadata_public != null
       && std.objectHas(ctx.identity.metadata_public, "recurly_account_code")
    then ctx.identity.metadata_public.recurly_account_code
    else null,
  session_id: ctx.session.id,
  event: "login",
}
```

### Webhook Handler (Login)

```javascript
// handlers/login.js
const recurly = require("recurly");
const client = new recurly.Client(process.env.RECURLY_API_KEY);

async function handleLogin(req, res) {
  const secret = req.headers["x-webhook-secret"];
  if (secret !== process.env.ORY_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  const { identity_id, recurly_account_code } = req.body;

  if (!recurly_account_code) {
    return res.status(200).json({
      identity: {
        metadata_public: {
          subscription_status: "none",
          subscription_plan: null,
        },
      },
    });
  }

  try {
    // Fetch active subscriptions from Recurly
    const subscriptions = client.listAccountSubscriptions(
      `code-${recurly_account_code}`,
      { params: { state: "live", limit: 1 } }
    );

    let subscriptionData = {
      subscription_status: "none",
      subscription_plan: null,
      subscription_id: null,
      subscription_current_period_ends_at: null,
    };

    for await (const sub of subscriptions.each()) {
      subscriptionData = {
        subscription_status: sub.state, // active, canceled, expired, future, paused
        subscription_plan: sub.plan?.name || sub.plan?.code,
        subscription_id: sub.uuid,
        subscription_current_period_ends_at:
          sub.currentPeriodEndsAt?.toISOString() || null,
      };
      break; // Take only the first (most recent) subscription
    }

    return res.status(200).json({
      identity: {
        metadata_public: {
          recurly_account_code,
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

## Part 3: Recurly to Ory (Subscription Status Sync)

### Step 1: Configure Recurly Webhook

In the Recurly Dashboard under **Integrations > Webhooks**, add an endpoint:

| Field | Value |
|-------|-------|
| URL | `https://api.example.com/hooks/recurly/subscription` |
| HTTP Auth | Basic or custom header |
| Events | All subscription and payment notifications |

### Step 2: Webhook Handler (Recurly to Ory)

Recurly sends webhooks as XML. Use a parser to extract the data.

```javascript
// handlers/recurly-webhook.js
const xml2js = require("xml2js");
const { OryClient } = require("@ory/client");

const ory = new OryClient({
  basePath: process.env.ORY_SDK_URL,
  accessToken: process.env.ORY_API_KEY,
});

const parser = new xml2js.Parser({ explicitArray: false });

async function handleRecurlyWebhook(req, res) {
  // 1. Verify authentication (Recurly supports HTTP Basic Auth for webhooks)
  const authHeader = req.headers["authorization"];
  const expected = `Basic ${Buffer.from(
    `${process.env.RECURLY_WEBHOOK_USER}:${process.env.RECURLY_WEBHOOK_PASS}`
  ).toString("base64")}`;

  if (authHeader !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // 2. Parse the XML payload
    const xmlBody =
      typeof req.body === "string" ? req.body : req.body.toString();
    const result = await parser.parseStringPromise(xmlBody);

    // Determine notification type from root element
    const notificationType = Object.keys(result)[0];
    const notification = result[notificationType];

    let accountCode = null;
    let subscriptionData = {};

    switch (notificationType) {
      case "new_subscription_notification":
      case "updated_subscription_notification":
      case "renewed_subscription_notification": {
        const sub = notification.subscription;
        accountCode = notification.account?.account_code;

        subscriptionData = {
          subscription_status: sub.state,
          subscription_plan: sub.plan?.name || sub.plan?.plan_code,
          subscription_id: sub.uuid,
          subscription_current_period_ends_at:
            sub.current_period_ends_at || null,
        };
        break;
      }

      case "expired_subscription_notification":
      case "canceled_subscription_notification": {
        const sub = notification.subscription;
        accountCode = notification.account?.account_code;

        subscriptionData = {
          subscription_status: sub.state, // expired or canceled
          subscription_plan: sub.plan?.name || sub.plan?.plan_code,
          subscription_id: sub.uuid,
        };
        break;
      }

      case "successful_payment_notification": {
        accountCode = notification.account?.account_code;
        subscriptionData = {
          last_payment_date: new Date().toISOString(),
        };
        break;
      }

      case "failed_payment_notification": {
        accountCode = notification.account?.account_code;
        subscriptionData = {
          subscription_status: "payment_failed",
          last_payment_failure: new Date().toISOString(),
        };
        break;
      }

      default:
        return res.status(200).json({ received: true, skipped: true });
    }

    if (!accountCode) {
      console.warn("No account code in Recurly webhook");
      return res.status(200).json({ received: true });
    }

    // 3. The account code is the Ory identity ID (set during creation)
    const oryIdentityId = accountCode;

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
          ...subscriptionData,
          last_synced: new Date().toISOString(),
        },
        metadata_admin: identity.metadata_admin,
      },
    });

    console.log(
      `Updated identity ${oryIdentityId}: ${JSON.stringify(subscriptionData)}`
    );

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Recurly webhook handler failed:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

module.exports = { handleRecurlyWebhook };
```

## Full Server Example

```javascript
// server.js
const express = require("express");
const { handleRegistration } = require("./handlers/registration");
const { handleLogin } = require("./handlers/login");
const { handleRecurlyWebhook } = require("./handlers/recurly-webhook");

const app = express();

// Recurly sends webhooks as XML
app.post(
  "/hooks/recurly/subscription",
  express.text({ type: "application/xml" }),
  handleRecurlyWebhook
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
  "name": "ory-recurly-integration",
  "version": "1.0.0",
  "dependencies": {
    "@ory/client": "^1.0.0",
    "express": "^4.18.0",
    "recurly": "^4.0.0",
    "xml2js": "^0.6.0"
  }
}
```

### Environment Variables

```bash
# .env (do not commit)
ORY_SDK_URL=https://your-project.projects.oryapis.com
ORY_API_KEY=ory_pat_...
ORY_WEBHOOK_SECRET=your-webhook-secret

RECURLY_API_KEY=your-recurly-private-api-key
RECURLY_WEBHOOK_USER=recurly
RECURLY_WEBHOOK_PASS=your-webhook-password

PORT=3000
```

## Example Recurly Webhook XML Payload

```xml
<?xml version="1.0" encoding="UTF-8"?>
<new_subscription_notification>
  <account>
    <account_code>7a3b1c2d-4e5f-6789-abcd-ef0123456789</account_code>
    <email>user@example.com</email>
    <first_name>Jane</first_name>
    <last_name>Doe</last_name>
  </account>
  <subscription>
    <uuid>abc123def456</uuid>
    <plan>
      <plan_code>pro</plan_code>
      <name>Pro Plan</name>
    </plan>
    <state>active</state>
    <quantity>1</quantity>
    <current_period_started_at>2024-12-01T00:00:00Z</current_period_started_at>
    <current_period_ends_at>2025-01-01T00:00:00Z</current_period_ends_at>
  </subscription>
</new_subscription_notification>
```

## Identity Metadata After Full Sync

```json
{
  "metadata_public": {
    "recurly_account_code": "7a3b1c2d-4e5f-6789-abcd-ef0123456789",
    "recurly_account_id": "abc123",
    "subscription_status": "active",
    "subscription_plan": "Pro Plan",
    "subscription_id": "abc123def456",
    "subscription_current_period_ends_at": "2025-01-01T00:00:00Z",
    "last_synced": "2024-12-15T10:30:00.000Z"
  }
}
```

## Troubleshooting

| Issue | Solution |
|-------|---------|
| Recurly 422 Validation Error | Ensure account code is unique; check required custom fields |
| XML parsing failure | Verify `express.text({ type: "application/xml" })` middleware is applied |
| Account not found in Recurly | Confirm the account code matches the Ory identity ID |
| Webhook not received | Check Recurly Dashboard > Integrations > Webhooks for delivery status |
| Stale subscription status | Verify Recurly webhook endpoint is healthy; check notification logs |

## References

- [Ory Webhooks Documentation](https://www.ory.sh/docs/guides/integrate-with-ory-cloud-through-webhooks)
- [Recurly API v3 Documentation](https://developers.recurly.com/api/v2021-02-25/)
- [Recurly Webhooks](https://developers.recurly.com/pages/webhooks.html)
- [Recurly Node.js Client](https://github.com/recurly/recurly-client-node)
