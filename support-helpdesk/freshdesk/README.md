# Freshdesk Integration with Ory Network

## Overview

Freshdesk is a customer support platform providing ticketing, collaboration, and automation tools. This integration connects Freshdesk to Ory Network to synchronize user data for ticket correlation and display Ory identity context within Freshdesk tickets, enabling support agents to understand a user's authentication state and identity details.

Key integration capabilities:
- Post-registration webhook creates Freshdesk contact with Ory identity data
- Custom Freshdesk app displaying Ory identity context in ticket sidebar
- Identity state and MFA status visible to support agents
- User deactivation sync between Ory and Freshdesk

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │    │              │
│   User       │─1─▶│  Ory Kratos  │─2─▶│  Webhook     │─3─▶│  Freshdesk   │
│   Registers  │    │  Registration│    │  Handler     │    │  Contacts    │
│              │    │              │    │              │    │  API         │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘

┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Freshdesk   │─4─▶│  Sidebar     │─5─▶│  Ory Admin   │
│  Agent View  │◀─6─│  App Backend │◀─6─│  API         │
└──────────────┘    └──────────────┘    └──────────────┘

Flow (User Sync):
1. User registers via Ory Kratos
2. Post-registration webhook fires
3. Handler creates Freshdesk contact with Ory identity ID

Flow (Sidebar):
4. Agent opens ticket; sidebar app activates
5. App backend queries Ory Admin API using requester email
6. Identity context returned and displayed in sidebar
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Provides user data and fires lifecycle webhooks. |
| **Ory Network Admin API** | Identity lookup for sidebar context display. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **Ory API Key**: Admin-level API key
- **Freshdesk Account**: Active Freshdesk subscription
- **Freshdesk API Key**: From Freshdesk Profile Settings > API Key
- **Freshdesk Domain**: Your Freshdesk subdomain (e.g., `yourcompany.freshdesk.com`)

## Configuration

### Step 1: Configure Post-Registration Webhook

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/flows/registration/after/hooks/0/hook="web_hook"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/url="https://your-service.com/freshdesk/user-sync"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/method="POST"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/body="file:///etc/config/kratos/freshdesk-sync.jsonnet"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/can_interrupt=false' \
  --add '/selfservice/flows/registration/after/hooks/0/config/response/ignore=true'
```

**Jsonnet template:**

```jsonnet
function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  name: {
    first: if std.objectHas(ctx.identity.traits, 'name') then ctx.identity.traits.name.first else '',
    last: if std.objectHas(ctx.identity.traits, 'name') then ctx.identity.traits.name.last else '',
  },
}
```

### Step 2: Implement Webhook Handler

```javascript
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const FRESHDESK_DOMAIN = process.env.FRESHDESK_DOMAIN;
const FRESHDESK_API_KEY = process.env.FRESHDESK_API_KEY;

const freshdeskClient = axios.create({
  baseURL: `https://${FRESHDESK_DOMAIN}.freshdesk.com/api/v2`,
  auth: { username: FRESHDESK_API_KEY, password: "X" },
  headers: { "Content-Type": "application/json" },
});

const oryAdmin = axios.create({
  baseURL: process.env.ORY_PROJECT_URL,
  headers: { Authorization: `Bearer ${process.env.ORY_API_KEY}` },
});

// User sync on registration
app.post("/freshdesk/user-sync", async (req, res) => {
  res.status(200).json({ status: "accepted" });

  const { identity_id, email, name } = req.body;

  try {
    const { data: existing } = await freshdeskClient.get(
      `/contacts?email=${encodeURIComponent(email)}`
    );

    if (existing.length > 0) {
      await freshdeskClient.put(`/contacts/${existing[0].id}`, {
        name: `${name.first} ${name.last}`.trim() || email,
        custom_fields: { ory_identity_id: identity_id },
      });
    } else {
      await freshdeskClient.post("/contacts", {
        email: email,
        name: `${name.first} ${name.last}`.trim() || email,
        custom_fields: { ory_identity_id: identity_id },
      });
    }

    console.log(`Synced ${email} to Freshdesk`);
  } catch (err) {
    console.error(`Freshdesk sync failed: ${err.message}`);
  }
});

// Sidebar backend for identity context
app.get("/freshdesk/sidebar/identity", async (req, res) => {
  const { email } = req.query;

  try {
    const { data: identities } = await oryAdmin.get("/admin/identities", {
      params: { credentials_identifier: email },
    });

    if (identities.length === 0) {
      return res.json({ found: false });
    }

    const identity = identities[0];
    const { data: sessions } = await oryAdmin.get(
      `/admin/identities/${identity.id}/sessions`,
      { params: { active: true } }
    );

    res.json({
      found: true,
      identity: {
        id: identity.id,
        state: identity.state,
        created_at: identity.created_at,
        has_mfa:
          (identity.credentials?.totp?.identifiers?.length || 0) > 0 ||
          (identity.credentials?.webauthn?.identifiers?.length || 0) > 0,
        active_sessions: sessions.length,
        last_login: sessions[0]?.authenticated_at || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000);
```

### Step 3: Create Custom Freshdesk App

Create a custom Freshdesk app using the Freshworks Developer Kit (FDK):

```bash
npm install -g fdk
fdk create --products freshdesk --template your_first_app
```

The sidebar app should fetch identity data from the backend and render it using safe DOM manipulation methods (use `document.createElement` and `textContent` rather than raw HTML string insertion to avoid XSS). See the Freshworks App Development guide for best practices on building sidebar apps.

**Key sidebar app requirements:**
- Use `client.data.get('contact')` to retrieve the ticket requester's email
- Call your backend endpoint `/freshdesk/sidebar/identity?email=<email>`
- Display identity ID, state, MFA status, active sessions, and last login
- Use `textContent` for all dynamic values to prevent XSS

### Step 4: Create Custom Contact Field

1. In Freshdesk, go to **Admin > Customer Fields**
2. Add a custom text field named `ory_identity_id`
3. This field will be populated by the user sync webhook

## Testing

### 1. Test User Sync

1. Register a user via your application
2. In Freshdesk, search for the contact by email
3. Verify custom field `ory_identity_id` is populated

### 2. Test Sidebar

1. Open a ticket from a synced contact
2. Verify the sidebar app displays identity context

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Contact not created** | Webhook not firing | Verify webhook config with `ory get identity-config` |
| **Freshdesk 401** | API key invalid | Verify API key in Freshdesk Profile Settings |
| **Custom field missing** | Not created in Freshdesk | Create `ory_identity_id` custom field under Admin > Customer Fields |
| **Sidebar not loading** | FDK app not deployed | Package and upload via Freshworks Developer portal |

## Resources

- [Freshdesk API Documentation](https://developers.freshdesk.com/api/)
- [Freshdesk Contacts API](https://developers.freshdesk.com/api/#contacts)
- [Freshworks App Development](https://developers.freshworks.com/docs/app-sdk/v2.3/)
- [Ory Webhooks Documentation](https://www.ory.sh/docs/guides/integrate-with-ory-cloud-through-webhooks)
- [Ory Admin API Reference](https://www.ory.sh/docs/reference/api)
