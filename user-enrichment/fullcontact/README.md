# FullContact Integration with Ory Network

## Overview

FullContact is a person and company data enrichment platform that resolves identity fragments (email, phone, social handle) into unified person and company profiles. This integration enriches Ory Network identities after registration with demographic, firmographic, and social data, enabling personalization and lead qualification without additional form fields.

Key integration capabilities:
- Post-registration async webhook enriches identity with person/company data
- Email-based person resolution provides name, title, company, location, and social profiles
- Enriched data stored in Ory identity `metadata_public`
- Supports FullContact's multi-field identity resolution for higher match rates

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │    │              │
│   User       │─1─▶│  Ory Kratos  │─2─▶│  Enrichment  │─3─▶│  FullContact │
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
3. Webhook handler calls FullContact Person Enrich API
4. Handler updates Ory identity metadata_public with enriched data
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Stores enriched data in identity metadata. Fires registration webhook. |
| **Ory Network Webhooks** | Triggers enrichment workflow on registration. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **Ory API Key**: Admin-level API key
- **FullContact API Key**: From [FullContact Dashboard](https://dashboard.fullcontact.com/)
- **Webhook Endpoint**: A publicly accessible service

## Configuration

### Step 1: Configure Post-Registration Webhook

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/flows/registration/after/hooks/0/hook="web_hook"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/url="https://your-service.com/enrich"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/method="POST"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/body="file:///etc/config/kratos/fullcontact-enrich.jsonnet"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/can_interrupt=false' \
  --add '/selfservice/flows/registration/after/hooks/0/config/response/ignore=true'
```

### Step 2: Jsonnet Webhook Template

**`fullcontact-enrich.jsonnet`:**

```jsonnet
function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
}
```

### Step 3: Implement Enrichment Handler

```javascript
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const oryAdmin = axios.create({
  baseURL: process.env.ORY_PROJECT_URL,
  headers: { Authorization: `Bearer ${process.env.ORY_API_KEY}` },
});

app.post("/enrich", async (req, res) => {
  res.status(200).json({ status: "accepted" });

  const { identity_id, email } = req.body;

  try {
    // Call FullContact Person Enrich API
    const { data: person } = await axios.post(
      "https://api.fullcontact.com/v3/person.enrich",
      { email: email },
      {
        headers: {
          Authorization: `Bearer ${process.env.FULLCONTACT_API_KEY}`,
        },
        validateStatus: (s) => s === 200 || s === 202 || s === 404,
      }
    );

    if (!person || person.status === 404) {
      console.log(`No enrichment data for ${email}`);
      return;
    }

    const { data: identity } = await oryAdmin.get(
      `/admin/identities/${identity_id}`
    );

    const enrichedMetadata = {
      ...identity.metadata_public,
      enrichment: {
        source: "fullcontact",
        enriched_at: new Date().toISOString(),
        person: {
          full_name: person.fullName || null,
          title: person.title || null,
          organization: person.organization || null,
          location: person.location || null,
          bio: person.bio || null,
          avatar: person.avatar || null,
          linkedin: person.linkedin || null,
          twitter: person.twitter || null,
        },
        company: person.details?.employment
          ? {
              name: person.details.employment.name || null,
              domain: person.details.employment.domain || null,
              title: person.details.employment.title || null,
            }
          : null,
      },
    };

    await oryAdmin.put(`/admin/identities/${identity_id}`, {
      schema_id: identity.schema_id,
      traits: identity.traits,
      state: identity.state,
      metadata_public: enrichedMetadata,
    });

    console.log(`Enriched ${identity_id} via FullContact`);
  } catch (err) {
    console.error(`Enrichment failed for ${identity_id}: ${err.message}`);
  }
});

app.listen(3000);
```

## Testing

### 1. Test FullContact API

```bash
curl -X POST "https://api.fullcontact.com/v3/person.enrich" \
  -H "Authorization: Bearer $FULLCONTACT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}' | jq '.fullName, .organization'
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
| **No enrichment data** | Email not in FullContact database | Personal emails have lower match rates |
| **202 response** | Async processing | FullContact may need time; implement retry or webhook callback |
| **Rate limiting** | Too many requests | Implement exponential backoff; check plan limits |
| **Webhook not firing** | Hook misconfigured | Verify with `ory get identity-config` |

## Resources

- [FullContact Person Enrich API](https://docs.fullcontact.com/docs/person-enrich)
- [FullContact Multi-Field Resolution](https://docs.fullcontact.com/docs/multi-field-resolution)
- [Ory Webhooks Documentation](https://www.ory.sh/docs/guides/integrate-with-ory-cloud-through-webhooks)
- [Ory Identity Metadata](https://www.ory.sh/docs/kratos/manage-identities/managing-users-identities-metadata)
