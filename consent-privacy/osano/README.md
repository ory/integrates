# Osano Integration with Ory Network

## Overview

Osano is a data privacy platform that provides consent management, data discovery, and vendor monitoring for privacy compliance (GDPR, CCPA, LGPD). This integration connects Osano to Ory Network to synchronize user consent preferences captured through Osano's consent management platform (CMP) with Ory identity metadata, and to fulfill data subject requests through Ory's admin API.

Key integration capabilities:
- Consent banner signals synchronized to Ory identity metadata
- Post-registration webhook creates consent records in Osano
- DSR handling for deletion, access, and portability requests
- Consent preference center linked to Ory identity

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │
│   User       │─1─▶│  Osano CMP   │─2─▶│  Consent     │
│   Browser    │    │  (Banner)    │    │  Sync Service│
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
1. User visits site, Osano CMP displays consent banner
2. User's consent choices are recorded in Osano
3. User registers/logs in via Ory Kratos
4. Consent sync service updates Ory identity metadata with consent state
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Stores user identities with consent state in metadata. Provides admin API for DSR fulfillment. |
| **Ory Network Webhooks** | Triggers consent synchronization on registration and settings updates. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **Ory API Key**: Admin-level API key
- **Osano Account**: Active Osano subscription with CMP configured
- **Osano API Key**: From Osano Dashboard under **Account > API**
- **Consent Sync Service**: Middleware to bridge Osano and Ory

## Configuration

### Step 1: Configure Osano CMP

1. Log in to [Osano Dashboard](https://app.osano.com/)
2. Navigate to **Consent Manager > Configuration**
3. Set up consent categories:
   - Essential (always on)
   - Analytics
   - Marketing
   - Personalization
4. Deploy the Osano CMP script on your application

```html
<script src="https://cmp.osano.com/<your-customer-id>/osano.js"></script>
```

### Step 2: Capture Consent and Link to Ory Identity

After the user authenticates via Ory, link their consent choices to their identity:

```javascript
// Client-side: after Ory login completes
const consentState = window.Osano.cm.getConsent();

// Send consent state to your backend
await fetch("/api/sync-consent", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Session-Token": orySessionToken,
  },
  body: JSON.stringify({
    consent: {
      analytics: consentState.ANALYTICS === "ACCEPT",
      marketing: consentState.MARKETING === "ACCEPT",
      personalization: consentState.PERSONALIZATION === "ACCEPT",
    },
  }),
});
```

### Step 3: Backend Consent Sync

```javascript
const axios = require("axios");
const express = require("express");

const app = express();
app.use(express.json());

const oryAdmin = axios.create({
  baseURL: process.env.ORY_PROJECT_URL,
  headers: { Authorization: `Bearer ${process.env.ORY_API_KEY}` },
});

app.post("/api/sync-consent", async (req, res) => {
  // Validate Ory session
  const sessionToken = req.headers["x-session-token"];
  const { data: session } = await axios.get(
    `${process.env.ORY_PROJECT_URL}/sessions/whoami`,
    { headers: { "X-Session-Token": sessionToken } }
  );

  const identityId = session.identity.id;
  const { consent } = req.body;

  // Update identity metadata with consent state
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
        ...consent,
        updated_at: new Date().toISOString(),
        source: "osano",
      },
    },
  });

  res.json({ status: "synced" });
});

// DSR handler for Osano
app.post("/osano/dsr", async (req, res) => {
  const { type, email } = req.body;

  const { data: identities } = await oryAdmin.get("/admin/identities", {
    params: { credentials_identifier: email },
  });

  if (identities.length === 0) {
    return res.status(404).json({ error: "Identity not found" });
  }

  const identity = identities[0];

  switch (type) {
    case "deletion":
      await oryAdmin.delete(`/admin/identities/${identity.id}`);
      break;
    case "access":
      return res.json({
        traits: identity.traits,
        metadata_public: identity.metadata_public,
        created_at: identity.created_at,
      });
    default:
      return res.status(400).json({ error: "Unsupported DSR type" });
  }

  res.json({ status: "completed" });
});

app.listen(3000);
```

### Step 4: Listen for Consent Changes

```javascript
// Client-side: listen for consent changes via Osano
window.Osano.cm.addEventListener("osano-cm-consent-changed", (consent) => {
  fetch("/api/sync-consent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Token": getOrySessionToken(),
    },
    body: JSON.stringify({
      consent: {
        analytics: consent.ANALYTICS === "ACCEPT",
        marketing: consent.MARKETING === "ACCEPT",
        personalization: consent.PERSONALIZATION === "ACCEPT",
      },
    }),
  });
});
```

## Testing

### 1. Test Consent Sync

1. Load your application with Osano CMP active
2. Accept or reject consent categories
3. Log in via Ory
4. Verify metadata update:

```bash
curl -s -H "Authorization: Bearer $ORY_API_KEY" \
  "$ORY_PROJECT_URL/admin/identities/<identity-id>" | \
  jq '.metadata_public.consent'
```

### 2. Test DSR Deletion

```bash
curl -X POST https://your-service.com/osano/dsr \
  -H "Content-Type: application/json" \
  -d '{"type": "deletion", "email": "user@example.com"}'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Consent not synced** | Session token invalid | Verify Ory session is active before syncing |
| **Osano CMP not loading** | Script tag misconfigured | Check the Osano customer ID in the script URL |
| **Metadata overwritten** | Missing spread operator | Ensure existing metadata_public is merged, not replaced |
| **DSR identity not found** | Email mismatch | Verify the email matches the Ory credential identifier |

## Resources

- [Osano Developer Documentation](https://docs.osano.com/)
- [Osano Consent Manager API](https://docs.osano.com/consent-manager-api)
- [Ory Admin API Reference](https://www.ory.sh/docs/reference/api)
- [Ory Webhooks Documentation](https://www.ory.sh/docs/guides/integrate-with-ory-cloud-through-webhooks)
