# Clearbit (HubSpot) Integration with Ory Network

## Overview

Clearbit (now part of HubSpot) is a data enrichment platform that provides company and person data from email addresses and domains. This integration enriches Ory Network identities with firmographic and demographic data after registration, enabling personalized onboarding, lead scoring, and account-based experiences without requiring users to fill in lengthy forms.

Key integration capabilities:
- Post-registration async webhook enriches identity with company/person data
- Email domain lookup provides company name, size, industry, and funding
- Person lookup provides title, role, seniority, and social profiles
- Enriched data stored in Ory identity `metadata_public` for downstream use
- Jsonnet template transforms Clearbit response to Ory metadata format

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │    │              │
│   User       │─1─▶│  Ory Kratos  │─2─▶│  Enrichment  │─3─▶│  Clearbit    │
│   Registers  │    │  Registration│    │  Webhook     │    │  API         │
│              │    │              │    │  Handler     │    │              │
└──────────────┘    └──────────────┘    └──────┬───────┘    └──────────────┘
                                               │
                                               4 (async)
                                               │
                                        ┌──────▼───────┐
                                        │  Ory Admin   │
                                        │  API         │
                                        │  (Update     │
                                        │  Metadata)   │
                                        └──────────────┘

Flow:
1. User registers with email address
2. Ory Kratos fires post-registration webhook
3. Webhook handler calls Clearbit Person + Company Enrichment API
4. Handler updates Ory identity metadata_public with enriched data
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Stores enriched data in identity metadata. Fires registration webhook. |
| **Ory Network Webhooks** | Triggers enrichment workflow on registration. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **Ory API Key**: Admin-level API key with read/write access to identities
- **Clearbit API Key**: From [Clearbit Dashboard](https://dashboard.clearbit.com/) (or HubSpot account with Clearbit access)
- **Webhook Endpoint**: A publicly accessible service to handle enrichment

## Configuration

### Step 1: Configure Post-Registration Webhook

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/flows/registration/after/hooks/0/hook="web_hook"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/url="https://your-enrichment-service.com/enrich"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/method="POST"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/body="file:///etc/config/kratos/clearbit-enrich.jsonnet"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/can_interrupt=false' \
  --add '/selfservice/flows/registration/after/hooks/0/config/response/ignore=true'
```

Setting `can_interrupt=false` and `response/ignore=true` ensures the registration completes immediately without waiting for enrichment.

### Step 2: Create Jsonnet Webhook Template

**`clearbit-enrich.jsonnet`:**

```jsonnet
function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  name: {
    first: if std.objectHas(ctx.identity.traits, 'name') then ctx.identity.traits.name.first else null,
    last: if std.objectHas(ctx.identity.traits, 'name') then ctx.identity.traits.name.last else null,
  },
}
```

### Step 3: Implement Enrichment Webhook Handler

```javascript
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const CLEARBIT_API_KEY = process.env.CLEARBIT_API_KEY;
const ORY_API_KEY = process.env.ORY_API_KEY;
const ORY_PROJECT_URL = process.env.ORY_PROJECT_URL;

const clearbitClient = axios.create({
  baseURL: "https://person.clearbit.com",
  headers: { Authorization: `Bearer ${CLEARBIT_API_KEY}` },
});

const oryAdmin = axios.create({
  baseURL: ORY_PROJECT_URL,
  headers: { Authorization: `Bearer ${ORY_API_KEY}` },
});

app.post("/enrich", async (req, res) => {
  // Respond immediately so Ory doesn't wait
  res.status(200).json({ status: "accepted" });

  const { identity_id, email } = req.body;

  try {
    // Call Clearbit Combined Enrichment API (person + company)
    const { data: enrichment } = await clearbitClient.get(
      `/v2/combined/find?email=${encodeURIComponent(email)}`,
      { validateStatus: (s) => s === 200 || s === 202 || s === 404 }
    );

    if (!enrichment || !enrichment.person) {
      console.log(`No enrichment data found for ${email}`);
      return;
    }

    // Fetch current identity
    const { data: identity } = await oryAdmin.get(
      `/admin/identities/${identity_id}`
    );

    // Build enriched metadata
    const enrichedMetadata = {
      ...identity.metadata_public,
      enrichment: {
        source: "clearbit",
        enriched_at: new Date().toISOString(),
        person: {
          name: enrichment.person.name?.fullName || null,
          title: enrichment.person.employment?.title || null,
          role: enrichment.person.employment?.role || null,
          seniority: enrichment.person.employment?.seniority || null,
          linkedin: enrichment.person.linkedin?.handle || null,
          twitter: enrichment.person.twitter?.handle || null,
          location: enrichment.person.geo?.city || null,
          country: enrichment.person.geo?.country || null,
          avatar: enrichment.person.avatar || null,
        },
        company: enrichment.company
          ? {
              name: enrichment.company.name || null,
              domain: enrichment.company.domain || null,
              industry: enrichment.company.category?.industry || null,
              sector: enrichment.company.category?.sector || null,
              size: enrichment.company.metrics?.employees || null,
              size_range: enrichment.company.metrics?.employeesRange || null,
              revenue_range: enrichment.company.metrics?.estimatedAnnualRevenue || null,
              funding: enrichment.company.metrics?.raised || null,
              country: enrichment.company.geo?.country || null,
              logo: enrichment.company.logo || null,
              tech: enrichment.company.tech || [],
            }
          : null,
      },
    };

    // Update identity metadata
    await oryAdmin.put(`/admin/identities/${identity_id}`, {
      schema_id: identity.schema_id,
      traits: identity.traits,
      state: identity.state,
      metadata_public: enrichedMetadata,
    });

    console.log(
      `Enriched identity ${identity_id} — ${enrichment.company?.name || "no company"}`
    );
  } catch (err) {
    console.error(`Enrichment failed for ${identity_id}: ${err.message}`);
  }
});

app.listen(3000, () => console.log("Enrichment service running on port 3000"));
```

### Step 4: Metadata Update Flow Diagram

```
Registration         Webhook             Clearbit           Ory Admin
    │                   │                   │                   │
    │──POST /register──▶│                   │                   │
    │◀──200 (session)───│                   │                   │
    │                   │──GET /v2/combined──▶                   │
    │                   │◀──enrichment data──│                   │
    │                   │                   │                   │
    │                   │──GET /admin/identities/{id}───────────▶│
    │                   │◀──current identity─────────────────────│
    │                   │                   │                   │
    │                   │──PUT /admin/identities/{id}───────────▶│
    │                   │  (with enriched metadata_public)       │
    │                   │◀──200─────────────────────────────────│
```

## Accessing Enriched Data

Once enriched, the data is available in `metadata_public` and can be read by your application:

```bash
# Fetch enriched identity
curl -s -H "Authorization: Bearer $ORY_API_KEY" \
  "$ORY_PROJECT_URL/admin/identities/<identity-id>" | \
  jq '.metadata_public.enrichment'
```

The `metadata_public` is also available in the session object returned by `/sessions/whoami`, so your application can access enrichment data without additional API calls.

## Testing

### 1. Test Clearbit API

```bash
curl -s -H "Authorization: Bearer $CLEARBIT_API_KEY" \
  "https://person.clearbit.com/v2/combined/find?email=test@stripe.com" | \
  jq '{person: .person.name.fullName, company: .company.name}'
```

### 2. Test End-to-End

1. Register a user with a corporate email address
2. Wait 2-3 seconds for async enrichment
3. Verify enrichment data in identity metadata

### 3. Verify Enrichment

```bash
ory get identity <identity-id> --project <project-id> --format json | \
  jq '.metadata_public.enrichment'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **No enrichment data** | Free/personal email domain | Clearbit has limited data for @gmail.com, @yahoo.com, etc. |
| **202 response from Clearbit** | Async lookup in progress | Implement webhook callback or retry after delay |
| **Identity update fails** | Concurrent metadata writes | Add retry logic with optimistic locking |
| **Webhook not firing** | Hook misconfigured | Verify with `ory get identity-config --project <project-id>` |
| **Clearbit 429 rate limit** | Too many requests | Implement backoff; Clearbit allows 600 requests/minute on standard plans |

## Resources

- [Clearbit Enrichment API](https://dashboard.clearbit.com/docs#enrichment-api)
- [Clearbit Combined API](https://dashboard.clearbit.com/docs#enrichment-api-combined-api)
- [Ory Webhooks Documentation](https://www.ory.sh/docs/guides/integrate-with-ory-cloud-through-webhooks)
- [Ory Identity Metadata](https://www.ory.sh/docs/kratos/manage-identities/managing-users-identities-metadata)
- [Ory Jsonnet Templates](https://www.ory.sh/docs/guides/integrate-with-ory-cloud-through-webhooks/webhook-body-jsonnet)
