# Intercom Integration with Ory Network

## Overview

Intercom is a customer messaging platform providing live chat, product tours, and customer engagement tools. This integration connects Intercom to Ory Network to enrich Intercom user profiles with identity data and keep them synchronized via webhooks, enabling identity-aware customer communication.

Key integration capabilities:
- Post-login webhook updates Intercom user with latest session data
- Post-registration webhook creates Intercom contact with Ory identity traits
- Ory identity metadata available in Intercom for agent context
- Identity-verified Intercom Messenger (HMAC-based)

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │    │              │
│   User       │─1─▶│  Ory Kratos  │─2─▶│  Webhook     │─3─▶│  Intercom    │
│   Logs In    │    │  Login/Reg   │    │  Handler     │    │  Contacts    │
│              │    │              │    │              │    │  API         │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘

Flow:
1. User logs in or registers via Ory Kratos
2. Ory fires post-login or post-registration webhook
3. Webhook handler creates/updates Intercom contact with identity data
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Provides user traits and session context. Fires lifecycle webhooks. |
| **Ory Network Webhooks** | Triggers Intercom sync on login and registration events. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **Ory API Key**: Admin-level API key
- **Intercom Account**: Active Intercom workspace
- **Intercom Access Token**: From Intercom Developer Hub (Settings > Integrations > Developer Hub)
- **Webhook Service**: A publicly accessible endpoint

## Configuration

### Step 1: Create Intercom Access Token

1. In Intercom, go to **Settings > Integrations > Developer Hub**
2. Create a new app (or use an existing one)
3. Under **Authentication**, generate an Access Token
4. Required scopes: `write.users`, `read.users`

### Step 2: Configure Ory Webhooks

**Post-registration webhook:**

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/flows/registration/after/hooks/0/hook="web_hook"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/url="https://your-service.com/intercom/sync"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/method="POST"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/body="file:///etc/config/kratos/intercom-sync.jsonnet"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/can_interrupt=false' \
  --add '/selfservice/flows/registration/after/hooks/0/config/response/ignore=true'
```

**Post-login webhook:**

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/flows/login/after/hooks/0/hook="web_hook"' \
  --add '/selfservice/flows/login/after/hooks/0/config/url="https://your-service.com/intercom/sync"' \
  --add '/selfservice/flows/login/after/hooks/0/config/method="POST"' \
  --add '/selfservice/flows/login/after/hooks/0/config/body="file:///etc/config/kratos/intercom-sync.jsonnet"' \
  --add '/selfservice/flows/login/after/hooks/0/config/can_interrupt=false' \
  --add '/selfservice/flows/login/after/hooks/0/config/response/ignore=true'
```

**Jsonnet template (`intercom-sync.jsonnet`):**

```jsonnet
function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  name: {
    first: if std.objectHas(ctx.identity.traits, 'name') then ctx.identity.traits.name.first else null,
    last: if std.objectHas(ctx.identity.traits, 'name') then ctx.identity.traits.name.last else null,
  },
  event: if std.objectHas(ctx, 'flow') && ctx.flow.type == 'registration' then 'registration' else 'login',
}
```

### Step 3: Implement Webhook Handler

```javascript
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const intercomClient = axios.create({
  baseURL: "https://api.intercom.io",
  headers: {
    Authorization: `Bearer ${process.env.INTERCOM_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

app.post("/intercom/sync", async (req, res) => {
  res.status(200).json({ status: "accepted" });

  const { identity_id, email, name, event } = req.body;

  try {
    // Create or update Intercom contact
    await intercomClient.post("/contacts", {
      role: "user",
      external_id: identity_id,
      email: email,
      name: [name?.first, name?.last].filter(Boolean).join(" ") || undefined,
      custom_attributes: {
        ory_identity_id: identity_id,
        last_ory_event: event,
        last_ory_event_at: new Date().toISOString(),
      },
      signed_up_at:
        event === "registration"
          ? Math.floor(Date.now() / 1000)
          : undefined,
      last_seen_at: Math.floor(Date.now() / 1000),
    });

    // Optionally log an event
    if (event === "registration") {
      // Search for the contact first to get the Intercom ID
      const { data: searchResult } = await intercomClient.post(
        "/contacts/search",
        {
          query: {
            field: "external_id",
            operator: "=",
            value: identity_id,
          },
        }
      );

      if (searchResult.data.length > 0) {
        const intercomId = searchResult.data[0].id;
        await intercomClient.post("/events", {
          event_name: "user-registered",
          created_at: Math.floor(Date.now() / 1000),
          user_id: identity_id,
          metadata: {
            source: "ory-network",
            email: email,
          },
        });
      }
    }

    console.log(`Synced ${email} to Intercom (${event})`);
  } catch (err) {
    console.error(`Intercom sync failed: ${err.message}`);
  }
});

app.listen(3000);
```

### Step 4: Identity-Verified Messenger (Optional)

To enable identity verification for the Intercom Messenger, generate an HMAC using the Intercom Identity Verification secret:

```javascript
const crypto = require("crypto");

function generateIntercomUserHash(userId) {
  return crypto
    .createHmac("sha256", process.env.INTERCOM_IDENTITY_SECRET)
    .update(userId)
    .digest("hex");
}

// In your application, after Ory login:
app.get("/api/intercom-hash", async (req, res) => {
  const session = await validateOrySession(req);
  const hash = generateIntercomUserHash(session.identity.id);
  res.json({ user_hash: hash, user_id: session.identity.id });
});
```

**Client-side Messenger initialization:**

```javascript
window.Intercom("boot", {
  api_base: "https://api-ish.intercom.io",
  app_id: "<your-intercom-app-id>",
  user_id: orySession.identity.id,
  user_hash: intercomUserHash, // from /api/intercom-hash
  email: orySession.identity.traits.email,
  name: orySession.identity.traits.name?.first,
});
```

## Testing

### 1. Test User Sync

1. Register a new user via your application
2. In Intercom, search for the user by email
3. Verify custom attributes include `ory_identity_id`

### 2. Test Login Sync

1. Log in as an existing user
2. Verify `last_seen_at` updated in Intercom

### 3. Verify API Access

```bash
curl -s -H "Authorization: Bearer $INTERCOM_ACCESS_TOKEN" \
  -H "Accept: application/json" \
  "https://api.intercom.io/contacts/search" \
  -X POST -H "Content-Type: application/json" \
  -d '{"query":{"field":"email","operator":"=","value":"user@example.com"}}' | jq '.data[0]'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Contact not created** | Webhook not firing | Verify webhook config with `ory get identity-config` |
| **Duplicate contacts** | Missing `external_id` | Always pass `external_id` (Ory identity ID) for deduplication |
| **Identity verification fails** | Wrong HMAC secret | Verify the Identity Verification secret in Intercom Developer Hub |
| **401 from Intercom** | Token expired or insufficient scopes | Regenerate token with `write.users` scope |

## Resources

- [Intercom Contacts API](https://developers.intercom.com/docs/references/rest-api/api.intercom.io/Contacts/)
- [Intercom Events API](https://developers.intercom.com/docs/references/rest-api/api.intercom.io/Data-Events/)
- [Intercom Identity Verification](https://developers.intercom.com/docs/build-an-integration/learn-more/security/identity-verification/)
- [Ory Webhooks Documentation](https://www.ory.sh/docs/guides/integrate-with-ory-cloud-through-webhooks)
- [Ory CLI Reference](https://www.ory.sh/docs/cli)
