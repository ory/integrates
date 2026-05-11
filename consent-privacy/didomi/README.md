# Didomi Integration with Ory Network

## Overview

Didomi is a consent management platform (CMP) that enables organizations to collect, store, and manage user consent for data processing activities in compliance with GDPR, CCPA, ePrivacy, and other privacy regulations. This integration connects Didomi to Ory Network to synchronize consent preferences with Ory identity metadata and handle data subject requests through Ory's admin API.

Key integration capabilities:
- Didomi consent signals synchronized to Ory identity metadata
- Post-authentication consent linking
- Consent-aware data processing based on Ory metadata
- DSR fulfillment via Ory admin API triggered by Didomi workflows
- Didomi consent proof stored alongside Ory identity

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │
│   User       │─1─▶│  Didomi CMP  │─2─▶│  Consent     │
│   Browser    │    │  (SDK/Banner)│    │  Sync Service│
│              │    │              │    │              │
└──────┬───────┘    └──────────────┘    └──────┬───────┘
       │                                       │
       3                                       4
       │                                       │
┌──────▼───────┐                        ┌──────▼───────┐
│  Ory Kratos  │◀───────────────────────│  Ory Admin   │
│  Login/Reg   │                        │  API         │
└──────────────┘                        └──────────────┘

Flow:
1. User visits site, Didomi CMP collects consent choices
2. Didomi records consent and fires consent-changed event
3. User authenticates via Ory Kratos
4. Consent sync service updates Ory identity metadata with current consent state
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Stores consent state in identity metadata. Provides admin API for DSR fulfillment. |
| **Ory Network Webhooks** | Triggers consent sync on identity lifecycle events. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **Ory API Key**: Admin-level API key
- **Didomi Account**: Active Didomi subscription
- **Didomi API Key**: From Didomi Console under **Settings > API Keys**
- **Didomi Organization ID**: From Didomi Console
- **Consent Sync Service**: Middleware to bridge Didomi and Ory

## Configuration

### Step 1: Configure Didomi CMP

1. Log in to [Didomi Console](https://console.didomi.io/)
2. Configure consent purposes and vendors
3. Deploy the Didomi SDK on your application:

```html
<script type="text/javascript">
  window.gdprAppliesGlobally = true;
  (function(){
    var defined = 'Didomi' in window;
    if(!defined){
      window.Didomi = window.Didomi || {};
      window.Didomi.preferences = window.Didomi.preferences || {};
    }
  })();
</script>
<script src="https://sdk.privacy-center.org/<your-api-key>/didomi.js" async></script>
```

### Step 2: Link Consent to Ory Identity

After Ory authentication, capture Didomi consent and sync to Ory identity metadata:

```javascript
// Client-side: after Ory login
window.Didomi.on("consent.changed", function (event) {
  const consent = window.Didomi.getUserConsentStatusForAll();

  fetch("/api/sync-didomi-consent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Token": orySessionToken,
    },
    body: JSON.stringify({
      purposes: consent.purposes,
      vendors: consent.vendors,
      didomi_user_id: window.Didomi.getUserId(),
    }),
  });
});
```

### Step 3: Backend Consent Sync Service

```javascript
const axios = require("axios");
const express = require("express");

const app = express();
app.use(express.json());

const oryAdmin = axios.create({
  baseURL: process.env.ORY_PROJECT_URL,
  headers: { Authorization: `Bearer ${process.env.ORY_API_KEY}` },
});

const didomiApi = axios.create({
  baseURL: "https://api.didomi.io/v1",
  headers: {
    Authorization: `Bearer ${process.env.DIDOMI_API_KEY}`,
    "X-Organization-Id": process.env.DIDOMI_ORG_ID,
  },
});

app.post("/api/sync-didomi-consent", async (req, res) => {
  const sessionToken = req.headers["x-session-token"];

  // Validate Ory session
  const { data: session } = await axios.get(
    `${process.env.ORY_PROJECT_URL}/sessions/whoami`,
    { headers: { "X-Session-Token": sessionToken } }
  );

  const identityId = session.identity.id;
  const { purposes, vendors, didomi_user_id } = req.body;

  // Update Ory identity metadata with consent
  const { data: identity } = await oryAdmin.get(
    `/admin/identities/${identityId}`
  );

  await oryAdmin.put(`/admin/identities/${identityId}`, {
    schema_id: identity.schema_id,
    traits: identity.traits,
    state: identity.state,
    metadata_public: {
      ...identity.metadata_public,
      consent: {
        purposes: purposes,
        vendors: vendors,
        didomi_user_id: didomi_user_id,
        updated_at: new Date().toISOString(),
        source: "didomi",
      },
    },
  });

  res.json({ status: "synced" });
});

// DSR callback from Didomi
app.post("/didomi/dsr-callback", async (req, res) => {
  const { request_type, user_email } = req.body;

  const { data: identities } = await oryAdmin.get("/admin/identities", {
    params: { credentials_identifier: user_email },
  });

  if (identities.length === 0) {
    return res.status(404).json({ error: "Identity not found" });
  }

  const identity = identities[0];

  switch (request_type) {
    case "delete":
      await oryAdmin.delete(`/admin/identities/${identity.id}`);
      return res.json({ status: "deleted" });

    case "access":
      return res.json({
        data: {
          traits: identity.traits,
          metadata_public: identity.metadata_public,
          created_at: identity.created_at,
        },
      });

    default:
      return res.status(400).json({ error: "Unsupported request type" });
  }
});

app.listen(3000);
```

### Step 4: Configure Didomi Rights Management Webhook

1. In Didomi Console, navigate to **Rights Management > Automation**
2. Add a webhook action for incoming DSRs
3. Set the webhook URL to `https://your-service.com/didomi/dsr-callback`

## Testing

### 1. Test Consent Sync

1. Visit your application with Didomi CMP active
2. Accept/reject consent purposes
3. Log in via Ory
4. Verify consent metadata:

```bash
curl -s -H "Authorization: Bearer $ORY_API_KEY" \
  "$ORY_PROJECT_URL/admin/identities/<identity-id>" | \
  jq '.metadata_public.consent'
```

### 2. Test DSR Handling

```bash
curl -X POST https://your-service.com/didomi/dsr-callback \
  -H "Content-Type: application/json" \
  -d '{"request_type": "access", "user_email": "user@example.com"}'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Consent not synced** | Ory session not active | Ensure user is authenticated before syncing consent |
| **Didomi SDK not loading** | API key incorrect | Verify API key in the Didomi script URL |
| **DSR callback fails** | Identity not found | Confirm email matches Ory credential identifier |
| **Metadata overwritten** | Object spread missing | Merge existing metadata_public before updating |

## Resources

- [Didomi Developer Documentation](https://developers.didomi.io/)
- [Didomi API Reference](https://developers.didomi.io/api/)
- [Didomi Web SDK](https://developers.didomi.io/cmp/web-sdk)
- [Ory Admin API Reference](https://www.ory.sh/docs/reference/api)
- [Ory Webhooks Documentation](https://www.ory.sh/docs/guides/integrate-with-ory-cloud-through-webhooks)
