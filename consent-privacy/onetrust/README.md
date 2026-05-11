# OneTrust Integration with Ory Network

## Overview

OneTrust is a privacy, security, and governance platform that enables organizations to manage consent, fulfill data subject requests (DSRs), and maintain compliance with privacy regulations including GDPR, CCPA, LGPD, and PIPA. This integration connects OneTrust to Ory Network to synchronize consent records at registration and handle identity-related data subject requests through Ory's admin API.

Key integration capabilities:
- Post-registration consent receipt creation in OneTrust
- Consent preference synchronization from OneTrust to Ory identity metadata
- DSR fulfillment (deletion, export, rectification) via Ory admin API
- Consent-aware registration flows
- Audit trail for consent lifecycle events

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │    │              │
│   User       │─1─▶│  Ory Kratos  │─2─▶│  Webhook     │─3─▶│  OneTrust    │
│   Browser    │    │  Registration│    │  Handler     │    │  Consent API │
│              │    │              │    │              │    │              │
└──────────────┘    └──────────────┘    └──────┬───────┘    └──────┬───────┘
                                               │                   │
                                               │                   4 (DSR callback)
                                               │                   │
                                        ┌──────▼───────┐    ┌──────▼───────┐
                                        │  Ory Admin   │◀─5─│  DSR Handler │
                                        │  API         │    │  (Webhook)   │
                                        └──────────────┘    └──────────────┘

Flow:
1. User registers and provides consent choices (marketing, analytics, etc.)
2. Ory Kratos completes registration, fires post-registration webhook
3. Webhook handler creates consent receipt in OneTrust with user's choices
4. When a DSR is submitted in OneTrust, it triggers a callback webhook
5. DSR handler calls Ory admin API to delete/export/update the identity
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Stores user identities, fires registration webhooks, and provides admin API for identity deletion/export. |
| **Ory Network Webhooks** | Triggers consent receipt creation on registration and other identity lifecycle events. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **Ory API Key**: Admin-level API key
- **OneTrust Account**: Active OneTrust subscription with Consent & Preferences module
- **OneTrust API Credentials**: Client ID and secret from OneTrust Developer Portal
- **Webhook Endpoint**: A publicly accessible service to handle webhooks from both Ory and OneTrust

## Configuration

### Step 1: Define Consent Purposes in OneTrust

1. Log in to [OneTrust](https://app.onetrust.com/)
2. Navigate to **Consent & Preferences > Purposes**
3. Create purposes matching your consent requirements:
   - `marketing_emails` — Marketing communications
   - `analytics` — Analytics and performance tracking
   - `personalization` — Content personalization
   - `third_party_sharing` — Third-party data sharing
4. Note the **Purpose ID** for each purpose

### Step 2: Configure Ory Identity Schema with Consent Fields

Include consent fields in your Ory identity schema so consent choices are captured at registration:

```json
{
  "$id": "https://example.com/identity.schema.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "User",
  "type": "object",
  "properties": {
    "traits": {
      "type": "object",
      "properties": {
        "email": {
          "type": "string",
          "format": "email",
          "title": "Email",
          "ory.sh/kratos": {
            "credentials": { "password": { "identifier": true } },
            "verification": { "via": "email" }
          }
        },
        "name": {
          "type": "object",
          "properties": {
            "first": { "type": "string", "title": "First Name" },
            "last": { "type": "string", "title": "Last Name" }
          }
        },
        "consent": {
          "type": "object",
          "properties": {
            "marketing_emails": { "type": "boolean", "default": false },
            "analytics": { "type": "boolean", "default": false },
            "personalization": { "type": "boolean", "default": false },
            "tos_accepted": { "type": "boolean" },
            "privacy_policy_accepted": { "type": "boolean" }
          },
          "required": ["tos_accepted", "privacy_policy_accepted"]
        }
      },
      "required": ["email", "consent"]
    }
  }
}
```

### Step 3: Configure Post-Registration Webhook in Ory

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/flows/registration/after/hooks/0/hook="web_hook"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/url="https://your-webhook-service.com/ory/post-registration"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/method="POST"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/body="file:///etc/config/kratos/onetrust-consent.jsonnet"'
```

**Jsonnet template (`onetrust-consent.jsonnet`):**

```jsonnet
function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  name: {
    first: ctx.identity.traits.name.first,
    last: ctx.identity.traits.name.last,
  },
  consent: {
    marketing_emails: ctx.identity.traits.consent.marketing_emails,
    analytics: ctx.identity.traits.consent.analytics,
    personalization: ctx.identity.traits.consent.personalization,
    tos_accepted: ctx.identity.traits.consent.tos_accepted,
    privacy_policy_accepted: ctx.identity.traits.consent.privacy_policy_accepted,
  },
  registered_at: ctx.identity.created_at,
}
```

### Step 4: Implement Webhook Handler

**Post-registration handler — creates OneTrust consent receipt:**

```javascript
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const ONETRUST_BASE = "https://app.onetrust.com/api";
const ONETRUST_CLIENT_ID = process.env.ONETRUST_CLIENT_ID;
const ONETRUST_CLIENT_SECRET = process.env.ONETRUST_CLIENT_SECRET;

// Purpose IDs from OneTrust
const PURPOSE_MAP = {
  marketing_emails: "<onetrust-purpose-id-1>",
  analytics: "<onetrust-purpose-id-2>",
  personalization: "<onetrust-purpose-id-3>",
};

async function getOneTrustToken() {
  const { data } = await axios.post(
    `${ONETRUST_BASE}/access/v1/oauth/token`,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: ONETRUST_CLIENT_ID,
      client_secret: ONETRUST_CLIENT_SECRET,
    })
  );
  return data.access_token;
}

// Handle post-registration webhook from Ory
app.post("/ory/post-registration", async (req, res) => {
  const { identity_id, email, name, consent, registered_at } = req.body;

  try {
    const token = await getOneTrustToken();

    // Build consent receipt purposes
    const purposes = Object.entries(consent)
      .filter(([key]) => PURPOSE_MAP[key])
      .map(([key, value]) => ({
        Id: PURPOSE_MAP[key],
        TransactionType: value ? "OPT_IN" : "NOT_GIVEN",
      }));

    // Create consent receipt in OneTrust
    await axios.post(
      `${ONETRUST_BASE}/consentmanager/v2/receipts`,
      {
        identifier: email,
        identifierType: "email",
        language: "en-us",
        test: false,
        purposes: purposes,
        dsDataElements: {
          Name: `${name.first} ${name.last}`,
          Email: email,
          ExternalId: identity_id,
        },
        requestInformation: {
          collectionPoint: "registration",
          collectionMethod: "web_form",
        },
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    console.log(`Consent receipt created for ${email} (${identity_id})`);
    res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("OneTrust consent receipt creation failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Handle DSR callback from OneTrust
app.post("/onetrust/dsr-callback", async (req, res) => {
  const { requestType, dataSubject } = req.body;
  const email = dataSubject.email;

  const oryClient = axios.create({
    baseURL: process.env.ORY_PROJECT_URL,
    headers: { Authorization: `Bearer ${process.env.ORY_API_KEY}` },
  });

  try {
    // Find identity by email
    const { data: identities } = await oryClient.get("/admin/identities", {
      params: {
        credentials_identifier: email,
      },
    });

    if (identities.length === 0) {
      return res.status(404).json({ error: "Identity not found" });
    }

    const identity = identities[0];

    switch (requestType) {
      case "DELETE":
        await oryClient.delete(`/admin/identities/${identity.id}`);
        console.log(`Identity ${identity.id} deleted for DSR`);
        break;

      case "EXPORT":
        // Return identity data for export
        const { data: fullIdentity } = await oryClient.get(
          `/admin/identities/${identity.id}`,
          { params: { include_credential: "oidc" } }
        );
        return res.status(200).json({
          status: "completed",
          data: {
            traits: fullIdentity.traits,
            metadata_public: fullIdentity.metadata_public,
            created_at: fullIdentity.created_at,
            updated_at: fullIdentity.updated_at,
            state: fullIdentity.state,
          },
        });

      case "RECTIFICATION":
        // Update identity with corrected data from DSR
        if (dataSubject.corrections) {
          await oryClient.put(`/admin/identities/${identity.id}`, {
            schema_id: identity.schema_id,
            traits: { ...identity.traits, ...dataSubject.corrections },
            state: identity.state,
          });
        }
        break;

      default:
        return res.status(400).json({ error: `Unknown request type: ${requestType}` });
    }

    res.status(200).json({ status: "completed" });
  } catch (err) {
    console.error("DSR handling failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log("Webhook handler running on port 3000"));
```

### Step 5: Configure OneTrust DSR Webhook

1. In OneTrust, navigate to **Privacy Rights Automation > Request Workflow**
2. Add a **Webhook** step to the workflow
3. Configure the webhook URL: `https://your-webhook-service.com/onetrust/dsr-callback`
4. Set the method to POST and include DSR details in the payload

## Consent Flow Architecture

```
Registration Flow:
┌────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  User  │───▶│ Consent  │───▶│  Ory     │───▶│ OneTrust │
│  Form  │    │ Checkboxes│   │ Register │    │ Receipt  │
└────────┘    └──────────┘    └──────────┘    └──────────┘

Consent Update Flow:
┌────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  User  │───▶│ OneTrust │───▶│ Consent  │───▶│ Ory      │
│  Pref  │    │ Pref     │    │ Webhook  │    │ Metadata │
│ Center │    │ Center   │    │          │    │ Update   │
└────────┘    └──────────┘    └──────────┘    └──────────┘

DSR Flow:
┌────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  User  │───▶│ OneTrust │───▶│  DSR     │───▶│ Ory      │
│  DSR   │    │ DSR      │    │ Handler  │    │ Admin    │
│ Submit │    │ Workflow │    │ Webhook  │    │ API      │
└────────┘    └──────────┘    └──────────┘    └──────────┘
```

## Testing

### 1. Test Consent Receipt Creation

1. Register a new user through your application with consent choices
2. Verify in OneTrust under **Consent & Preferences > Consent Records** that the receipt was created
3. Confirm the purpose opt-in/opt-out statuses match the registration form

### 2. Test DSR Deletion

```bash
# Submit a test DSR in OneTrust, then verify the identity was deleted
curl -s -H "Authorization: Bearer $ORY_API_KEY" \
  "$ORY_PROJECT_URL/admin/identities?credentials_identifier=test@example.com" | jq length
# Should return 0 after deletion
```

### 3. Test DSR Export

Submit an export DSR in OneTrust and verify the returned data package contains the expected identity traits.

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Consent receipt not created** | Webhook not firing | Verify webhook configuration in Ory with `ory get identity-config` |
| **OneTrust 401** | Expired OAuth token | Ensure token refresh is implemented; check client credentials |
| **DSR handler returns 404** | Email not found in Ory | Verify the email matches the credential identifier in Ory |
| **Duplicate consent receipts** | Webhook retry on timeout | Make handler idempotent using identity_id as dedup key |
| **Missing consent fields** | Schema not updated | Verify identity schema includes consent object |

## Resources

- [OneTrust Developer Portal](https://developer.onetrust.com/)
- [OneTrust Consent API](https://developer.onetrust.com/docs/consent-management)
- [Ory Webhooks Documentation](https://www.ory.sh/docs/guides/integrate-with-ory-cloud-through-webhooks)
- [Ory Identity Schema](https://www.ory.sh/docs/kratos/manage-identities/identity-schema)
- [Ory Admin API Reference](https://www.ory.sh/docs/reference/api)
- [GDPR Data Subject Rights](https://gdpr-info.eu/chapter-3/)
