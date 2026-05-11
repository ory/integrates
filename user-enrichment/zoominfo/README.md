# ZoomInfo Integration with Ory Network

## Overview

ZoomInfo is a B2B data intelligence platform providing contact, company, and intent data for sales, marketing, and recruiting teams. This integration enriches Ory Network identities after registration with B2B contact and company data from ZoomInfo's database, enabling lead qualification, account-based marketing, and sales-ready data enrichment.

Key integration capabilities:
- Post-registration async webhook enriches identity with B2B contact data
- Email-based person/company lookup provides title, department, company size, industry, revenue
- Enriched data stored in Ory identity `metadata_public`
- Supports ZoomInfo's Contact and Company Search APIs

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │    │              │
│   User       │─1─▶│  Ory Kratos  │─2─▶│  Enrichment  │─3─▶│  ZoomInfo    │
│   Registers  │    │  Registration│    │  Webhook     │    │  Enrich API  │
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
3. Webhook handler calls ZoomInfo Contact Search API with email
4. Handler updates Ory identity metadata_public with enriched data
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Stores enriched B2B data in identity metadata. Fires registration webhook. |
| **Ory Network Webhooks** | Triggers enrichment workflow on registration. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **Ory API Key**: Admin-level API key
- **ZoomInfo Account**: Active ZoomInfo subscription with API access
- **ZoomInfo API Credentials**: Username and API key/PKE from ZoomInfo admin settings
- **Webhook Endpoint**: A publicly accessible service

## Configuration

### Step 1: Obtain ZoomInfo API Access

1. Log in to [ZoomInfo](https://app.zoominfo.com/)
2. Navigate to **Admin > API > Manage API**
3. Generate API credentials (PKE-based or JWT-based authentication)
4. Note the API base URL (typically `https://api.zoominfo.com`)

### Step 2: Configure Post-Registration Webhook

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/flows/registration/after/hooks/0/hook="web_hook"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/url="https://your-service.com/enrich"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/method="POST"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/body="file:///etc/config/kratos/zoominfo-enrich.jsonnet"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/can_interrupt=false' \
  --add '/selfservice/flows/registration/after/hooks/0/config/response/ignore=true'
```

### Step 3: Jsonnet Webhook Template

```jsonnet
function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
}
```

### Step 4: Implement Enrichment Handler

```javascript
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const oryAdmin = axios.create({
  baseURL: process.env.ORY_PROJECT_URL,
  headers: { Authorization: `Bearer ${process.env.ORY_API_KEY}` },
});

async function getZoomInfoToken() {
  const { data } = await axios.post(
    "https://api.zoominfo.com/authenticate",
    {
      username: process.env.ZOOMINFO_USERNAME,
      password: process.env.ZOOMINFO_PASSWORD,
    }
  );
  return data.jwt;
}

app.post("/enrich", async (req, res) => {
  res.status(200).json({ status: "accepted" });

  const { identity_id, email } = req.body;

  try {
    const token = await getZoomInfoToken();
    const ziClient = axios.create({
      baseURL: "https://api.zoominfo.com",
      headers: { Authorization: `Bearer ${token}` },
    });

    // Search for contact by email
    const { data: contactResult } = await ziClient.post(
      "/search/contact",
      {
        outputFields: [
          "firstName", "lastName", "email", "jobTitle", "managementLevel",
          "department", "companyName", "companyId", "companyRevenue",
          "companyEmployeeCount", "industry", "city", "state", "country",
          "linkedinUrl", "directPhoneNumber"
        ],
        matchPersonInput: [{ emailAddress: email }],
        rpp: 1,
      }
    );

    const contact = contactResult?.data?.[0];
    if (!contact) {
      console.log(`No ZoomInfo data for ${email}`);
      return;
    }

    const { data: identity } = await oryAdmin.get(
      `/admin/identities/${identity_id}`
    );

    const enrichedMetadata = {
      ...identity.metadata_public,
      enrichment: {
        source: "zoominfo",
        enriched_at: new Date().toISOString(),
        person: {
          first_name: contact.firstName || null,
          last_name: contact.lastName || null,
          title: contact.jobTitle || null,
          management_level: contact.managementLevel || null,
          department: contact.department || null,
          linkedin_url: contact.linkedinUrl || null,
          city: contact.city || null,
          state: contact.state || null,
          country: contact.country || null,
        },
        company: {
          name: contact.companyName || null,
          zoominfo_company_id: contact.companyId || null,
          employee_count: contact.companyEmployeeCount || null,
          revenue: contact.companyRevenue || null,
          industry: contact.industry || null,
        },
      },
    };

    await oryAdmin.put(`/admin/identities/${identity_id}`, {
      schema_id: identity.schema_id,
      traits: identity.traits,
      state: identity.state,
      metadata_public: enrichedMetadata,
    });

    console.log(
      `Enriched ${identity_id} via ZoomInfo — ${contact.companyName || "unknown company"}`
    );
  } catch (err) {
    console.error(`Enrichment failed for ${identity_id}: ${err.message}`);
  }
});

app.listen(3000);
```

## Testing

### 1. Test ZoomInfo API

```bash
# Authenticate
TOKEN=$(curl -s -X POST "https://api.zoominfo.com/authenticate" \
  -H "Content-Type: application/json" \
  -d '{"username":"'$ZOOMINFO_USERNAME'","password":"'$ZOOMINFO_PASSWORD'"}' | jq -r '.jwt')

# Search contact
curl -s -X POST "https://api.zoominfo.com/search/contact" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"matchPersonInput":[{"emailAddress":"test@example.com"}],"rpp":1}' | jq '.data[0]'
```

### 2. Verify Enrichment

```bash
curl -s -H "Authorization: Bearer $ORY_API_KEY" \
  "$ORY_PROJECT_URL/admin/identities/<identity-id>" | \
  jq '.metadata_public.enrichment'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **No enrichment data** | Email not in ZoomInfo database | B2B emails have higher match rates than personal emails |
| **401 from ZoomInfo** | JWT expired | ZoomInfo JWTs expire; implement token refresh |
| **Rate limiting** | API quota exceeded | Check plan limits; implement request queuing |
| **Webhook not firing** | Hook misconfigured | Verify with `ory get identity-config` |
| **Partial data** | Output fields not included | Add required fields to `outputFields` array |

## Resources

- [ZoomInfo API Documentation](https://api-docs.zoominfo.com/)
- [ZoomInfo Contact Search API](https://api-docs.zoominfo.com/#contact-search)
- [Ory Webhooks Documentation](https://www.ory.sh/docs/guides/integrate-with-ory-cloud-through-webhooks)
- [Ory Identity Metadata](https://www.ory.sh/docs/kratos/manage-identities/managing-users-identities-metadata)
