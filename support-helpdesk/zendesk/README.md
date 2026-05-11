# Zendesk Integration with Ory Network

## Overview

Zendesk is a customer service platform providing ticketing, live chat, and knowledge base capabilities. This integration connects Zendesk to Ory Network to display identity context in the agent sidebar, synchronize users for ticket correlation, and enable identity-aware support workflows.

Key integration capabilities:
- Zendesk sidebar app displaying Ory identity details (traits, MFA status, sessions)
- User sync from Ory to Zendesk for ticket correlation
- Post-registration webhook creates Zendesk user
- Identity context available to agents without leaving Zendesk

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │
│  Zendesk     │─1─▶│  Sidebar     │─2─▶│  Ory Network │
│  Agent UI    │    │  App Backend │    │  Admin API   │
│              │◀─3─│              │◀─3─│              │
└──────────────┘    └──────────────┘    └──────────────┘

┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │
│  User        │─4─▶│  Ory Kratos  │─5─▶│  User Sync   │─6─▶│  Zendesk API │
│  Registers   │    │  Registration│    │  Webhook     │    │  Users API   │
│              │    │              │    │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘

Flow (Sidebar):
1. Agent opens a ticket; sidebar app activates
2. Sidebar app backend queries Ory Admin API using requester email
3. Ory identity context displayed in Zendesk sidebar

Flow (User Sync):
4. User registers in your application via Ory Kratos
5. Post-registration webhook fires
6. Webhook handler creates/updates corresponding Zendesk user
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Provides identity data and session context. Fires lifecycle webhooks. |
| **Ory Network Admin API** | Queries identity details for sidebar display and user sync. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **Ory API Key**: Admin-level API key
- **Zendesk Account**: Zendesk Suite (Support) with admin access
- **Zendesk API Token**: From Zendesk Admin Center > Apps and Integrations > APIs
- **ZAT (Zendesk Apps Tools)**: For building and deploying the sidebar app (optional for custom apps)

## Configuration

### Step 1: Create Zendesk API Credentials

1. In Zendesk Admin Center, go to **Apps and Integrations > APIs > Zendesk API**
2. Enable Token Access
3. Create a new API token
4. Note your Zendesk subdomain (e.g., `yourcompany.zendesk.com`)

### Step 2: Configure User Sync Webhook

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/flows/registration/after/hooks/0/hook="web_hook"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/url="https://your-service.com/zendesk/user-sync"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/method="POST"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/body="file:///etc/config/kratos/zendesk-sync.jsonnet"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/can_interrupt=false' \
  --add '/selfservice/flows/registration/after/hooks/0/config/response/ignore=true'
```

**Jsonnet template (`zendesk-sync.jsonnet`):**

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

### Step 3: Implement User Sync and Sidebar Backend

```javascript
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const ZENDESK_SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN;
const ZENDESK_EMAIL = process.env.ZENDESK_ADMIN_EMAIL;
const ZENDESK_TOKEN = process.env.ZENDESK_API_TOKEN;

const oryAdmin = axios.create({
  baseURL: process.env.ORY_PROJECT_URL,
  headers: { Authorization: `Bearer ${process.env.ORY_API_KEY}` },
});

const zendeskClient = axios.create({
  baseURL: `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`,
  auth: { username: `${ZENDESK_EMAIL}/token`, password: ZENDESK_TOKEN },
  headers: { "Content-Type": "application/json" },
});

// User sync webhook handler
app.post("/zendesk/user-sync", async (req, res) => {
  res.status(200).json({ status: "accepted" });

  const { identity_id, email, name } = req.body;

  try {
    await zendeskClient.post("/users/create_or_update", {
      user: {
        email: email,
        name: `${name.first} ${name.last}`.trim() || email,
        external_id: identity_id,
        verified: true,
        user_fields: {
          ory_identity_id: identity_id,
        },
      },
    });

    console.log(`Synced user ${email} to Zendesk`);
  } catch (err) {
    console.error(`Zendesk user sync failed: ${err.message}`);
  }
});

// Sidebar app backend — fetch Ory identity context
app.get("/zendesk/sidebar/identity", async (req, res) => {
  const { email } = req.query;

  const zendeskSecret = req.headers["x-zendesk-secret"];
  if (zendeskSecret !== process.env.ZENDESK_SIDEBAR_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

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

    return res.json({
      found: true,
      identity: {
        id: identity.id,
        email: identity.traits?.email,
        name: identity.traits?.name,
        state: identity.state,
        created_at: identity.created_at,
        updated_at: identity.updated_at,
        has_mfa:
          (identity.credentials?.totp?.identifiers?.length || 0) > 0 ||
          (identity.credentials?.webauthn?.identifiers?.length || 0) > 0,
        active_sessions: sessions.length,
        last_session: sessions.length > 0 ? sessions[0].authenticated_at : null,
        metadata_public: identity.metadata_public,
      },
    });
  } catch (err) {
    console.error(`Sidebar lookup failed: ${err.message}`);
    res.status(500).json({ error: "Internal error" });
  }
});

app.listen(3000);
```

### Step 4: Build Zendesk Sidebar App

Create a Zendesk sidebar app that displays Ory identity context.

**`manifest.json`:**

```json
{
  "name": "Ory Identity Context",
  "author": {
    "name": "Your Company"
  },
  "defaultLocale": "en",
  "location": {
    "support": {
      "ticket_sidebar": {
        "url": "assets/iframe.html",
        "flexible": true
      }
    }
  },
  "parameters": [
    {
      "name": "sidebar_backend_url",
      "type": "text",
      "required": true
    },
    {
      "name": "sidebar_secret",
      "type": "text",
      "required": true
    }
  ]
}
```

**`assets/iframe.html`:**

The sidebar app fetches identity data from the backend and renders it using safe DOM manipulation (use `textContent` for inserting values, or a sanitization library like DOMPurify if rendering HTML):

```html
<html>
<head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@zendeskgarden/css-bedrock@8/dist/index.min.css">
  <style>
    body { font-family: sans-serif; padding: 10px; font-size: 13px; }
    .field { margin-bottom: 8px; }
    .label { font-weight: bold; color: #666; font-size: 11px; text-transform: uppercase; }
    .value { color: #333; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
    .badge-green { background: #e6f5e6; color: #2e7d32; }
    .badge-red { background: #fde8e8; color: #c62828; }
    .badge-gray { background: #f0f0f0; color: #666; }
  </style>
</head>
<body>
  <div id="content">Loading identity context...</div>
  <script src="https://static.zdassets.com/zendesk_app_framework_sdk/2.0/zaf_sdk.min.js"></script>
  <script>
    var client = ZAFClient.init();

    function createField(label, value, badgeClass) {
      var field = document.createElement('div');
      field.className = 'field';

      var labelEl = document.createElement('div');
      labelEl.className = 'label';
      labelEl.textContent = label;
      field.appendChild(labelEl);

      var valueEl = document.createElement('div');
      valueEl.className = 'value';

      if (badgeClass) {
        var badge = document.createElement('span');
        badge.className = 'badge ' + badgeClass;
        badge.textContent = value;
        valueEl.appendChild(badge);
      } else {
        valueEl.textContent = value;
      }

      field.appendChild(valueEl);
      return field;
    }

    client.get('ticket.requester.email').then(function(data) {
      var email = data['ticket.requester.email'];

      client.metadata().then(function(metadata) {
        var backendUrl = metadata.settings.sidebar_backend_url;
        var secret = metadata.settings.sidebar_secret;

        fetch(backendUrl + '/zendesk/sidebar/identity?email=' + encodeURIComponent(email), {
          headers: { 'X-Zendesk-Secret': secret }
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var container = document.getElementById('content');
          container.textContent = '';

          if (!data.found) {
            container.textContent = 'No Ory identity found for this email.';
            return;
          }

          var id = data.identity;
          container.appendChild(createField('Identity ID', id.id));
          container.appendChild(createField('State', id.state, id.state === 'active' ? 'badge-green' : 'badge-red'));
          container.appendChild(createField('MFA', id.has_mfa ? 'Enabled' : 'Not enrolled', id.has_mfa ? 'badge-green' : 'badge-gray'));
          container.appendChild(createField('Active Sessions', String(id.active_sessions)));
          container.appendChild(createField('Last Login', id.last_session || 'N/A'));
          container.appendChild(createField('Registered', new Date(id.created_at).toLocaleDateString()));
          client.invoke('resize', { width: '100%', height: '250px' });
        });
      });
    });
  </script>
</body>
</html>
```

### Step 5: Deploy the Sidebar App

```bash
# Install Zendesk CLI
npm install -g @zendesk/zcli

# Validate and package the app
zcli apps:validate
zcli apps:package

# Upload via Zendesk Admin Center > Apps > Upload Private App
```

## Testing

### 1. Test User Sync

1. Register a new user via your application
2. In Zendesk, search for the user by email
3. Verify the user exists with the `ory_identity_id` custom field

### 2. Test Sidebar App

1. Open a ticket from a user who has an Ory identity
2. The sidebar should display identity context (state, MFA, sessions)

### 3. Verify Admin API Access

```bash
curl -s -H "Authorization: Bearer $ORY_API_KEY" \
  "$ORY_PROJECT_URL/admin/identities?credentials_identifier=user@example.com" | \
  jq '.[0] | {id, state, created_at}'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Sidebar shows "not found"** | Email mismatch | Ensure ticket requester email matches Ory credential identifier |
| **User sync fails** | Zendesk API token invalid | Regenerate token in Zendesk Admin Center |
| **Sidebar app not loading** | Manifest misconfigured | Validate with `zcli apps:validate` |
| **CORS errors in sidebar** | Backend not allowing Zendesk origin | Add Zendesk subdomain to CORS allowed origins |

## Resources

- [Zendesk Apps Framework](https://developer.zendesk.com/documentation/apps/)
- [Zendesk REST API — Users](https://developer.zendesk.com/api-reference/ticketing/users/users/)
- [Zendesk Sidebar App Guide](https://developer.zendesk.com/documentation/apps/getting-started/building-your-first-support-app/)
- [Ory Admin API Reference](https://www.ory.sh/docs/reference/api)
- [Ory Webhooks Documentation](https://www.ory.sh/docs/guides/integrate-with-ory-cloud-through-webhooks)
