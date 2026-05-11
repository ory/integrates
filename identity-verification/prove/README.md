# Prove Integration with Ory Network

## Overview

Prove (formerly Payfone) is a phone-centric identity verification platform that uses telecom signals and phone intelligence to verify identities, detect SIM swaps, and authenticate users via their mobile phone number. This integration adds pre-registration or post-registration identity verification to Ory Network flows, enabling phone-based identity proofing and fraud detection.

Key integration capabilities:
- Pre-registration SIM swap detection to prevent account takeover
- Phone number ownership verification via Prove Trust Score
- Phone-centric identity verification (Prove Identity)
- Post-registration async enrichment with phone intelligence data
- Webhook-based integration with Ory identity lifecycle

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │    │              │
│   User       │─1─▶│  Ory Kratos  │─2─▶│  Verification│─3─▶│  Prove API   │
│   Registers  │    │  Registration│    │  Webhook     │    │  (Trust/     │
│              │    │              │    │  Handler     │    │   Identity)  │
│              │◀─6─│              │◀─5─│              │◀─4─│              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘

Flow:
1. User provides phone number during registration
2. Ory fires pre/post-registration webhook
3. Handler calls Prove API for phone verification
4. Prove returns Trust Score, SIM swap status, and identity match
5. Handler updates Ory identity metadata or blocks registration
6. User proceeds with verified identity
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Captures phone number, fires webhooks, stores verification results. |
| **Ory Network Webhooks** | Pre-registration (blocking) or post-registration webhook for Prove verification. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **Prove Account**: Active Prove subscription with API access
- **Prove API Credentials**: Client ID and secret from Prove Developer Portal
- **Phone Number Collection**: Identity schema must include phone number field

## Configuration

### Step 1: Update Identity Schema

Include phone number in your identity schema:

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
          "ory.sh/kratos": {
            "credentials": { "password": { "identifier": true } },
            "verification": { "via": "email" }
          }
        },
        "phone": {
          "type": "string",
          "title": "Phone Number",
          "pattern": "^\\+[1-9]\\d{6,14}$"
        },
        "name": {
          "type": "object",
          "properties": {
            "first": { "type": "string" },
            "last": { "type": "string" }
          }
        }
      },
      "required": ["email", "phone"]
    }
  }
}
```

### Step 2: Configure Pre-Registration Webhook (Blocking)

For SIM swap detection that can block suspicious registrations:

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/flows/registration/before/hooks/0/hook="web_hook"' \
  --add '/selfservice/flows/registration/before/hooks/0/config/url="https://your-service.com/prove/pre-register"' \
  --add '/selfservice/flows/registration/before/hooks/0/config/method="POST"' \
  --add '/selfservice/flows/registration/before/hooks/0/config/body="file:///etc/config/kratos/prove-prereq.jsonnet"' \
  --add '/selfservice/flows/registration/before/hooks/0/config/can_interrupt=true'
```

For post-registration async verification:

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/flows/registration/after/hooks/0/hook="web_hook"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/url="https://your-service.com/prove/post-register"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/method="POST"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/body="file:///etc/config/kratos/prove-postreq.jsonnet"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/can_interrupt=false' \
  --add '/selfservice/flows/registration/after/hooks/0/config/response/ignore=true'
```

### Step 3: Jsonnet Templates

**Pre-registration (`prove-prereq.jsonnet`):**

```jsonnet
function(ctx) {
  phone: ctx.identity.traits.phone,
  name: {
    first: if std.objectHas(ctx.identity.traits, 'name') then ctx.identity.traits.name.first else null,
    last: if std.objectHas(ctx.identity.traits, 'name') then ctx.identity.traits.name.last else null,
  },
}
```

**Post-registration (`prove-postreq.jsonnet`):**

```jsonnet
function(ctx) {
  identity_id: ctx.identity.id,
  phone: ctx.identity.traits.phone,
  email: ctx.identity.traits.email,
  name: {
    first: if std.objectHas(ctx.identity.traits, 'name') then ctx.identity.traits.name.first else null,
    last: if std.objectHas(ctx.identity.traits, 'name') then ctx.identity.traits.name.last else null,
  },
}
```

### Step 4: Implement Webhook Handler

```javascript
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PROVE_CLIENT_ID = process.env.PROVE_CLIENT_ID;
const PROVE_CLIENT_SECRET = process.env.PROVE_CLIENT_SECRET;
const PROVE_BASE_URL = "https://api.prove.com";

const oryAdmin = axios.create({
  baseURL: process.env.ORY_PROJECT_URL,
  headers: { Authorization: `Bearer ${process.env.ORY_API_KEY}` },
});

async function getProveToken() {
  const { data } = await axios.post(`${PROVE_BASE_URL}/token`, {
    client_id: PROVE_CLIENT_ID,
    client_secret: PROVE_CLIENT_SECRET,
    grant_type: "client_credentials",
  });
  return data.access_token;
}

// Pre-registration: SIM swap detection (blocking)
app.post("/prove/pre-register", async (req, res) => {
  const { phone } = req.body;

  try {
    const token = await getProveToken();

    // Check Trust Score and SIM swap status
    const { data: trust } = await axios.post(
      `${PROVE_BASE_URL}/v3/trust/v2`,
      { phoneNumber: phone },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Block if recent SIM swap detected or very low trust score
    if (trust.simSwap?.swapDetected && trust.simSwap?.daysSinceSwap < 7) {
      return res.status(403).json({
        messages: [
          {
            id: 4000001,
            type: "error",
            text: "Phone number verification failed. Please try again later or contact support.",
          },
        ],
      });
    }

    if (trust.trustScore < 300) {
      return res.status(403).json({
        messages: [
          {
            id: 4000002,
            type: "error",
            text: "Unable to verify phone number. Please use an alternative verification method.",
          },
        ],
      });
    }

    // Allow registration to proceed
    res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Prove pre-registration check failed:", err.message);
    // Fail open: allow registration if Prove is unavailable
    res.status(200).json({ status: "ok" });
  }
});

// Post-registration: full verification and enrichment
app.post("/prove/post-register", async (req, res) => {
  res.status(200).json({ status: "accepted" });

  const { identity_id, phone, name } = req.body;

  try {
    const token = await getProveToken();

    // Get Trust Score
    const { data: trust } = await axios.post(
      `${PROVE_BASE_URL}/v3/trust/v2`,
      { phoneNumber: phone },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Identity verification (if name provided)
    let identityMatch = null;
    if (name?.first && name?.last) {
      const { data: identity } = await axios.post(
        `${PROVE_BASE_URL}/v3/identity/v2`,
        {
          phoneNumber: phone,
          firstName: name.first,
          lastName: name.last,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      identityMatch = identity;
    }

    // Update Ory identity with verification results
    const { data: oryIdentity } = await oryAdmin.get(
      `/admin/identities/${identity_id}`
    );

    await oryAdmin.put(`/admin/identities/${identity_id}`, {
      schema_id: oryIdentity.schema_id,
      traits: oryIdentity.traits,
      state: oryIdentity.state,
      metadata_public: {
        ...oryIdentity.metadata_public,
        prove: {
          verified: trust.trustScore >= 600,
          trust_score: trust.trustScore,
          phone_type: trust.phoneType,
          carrier: trust.carrier,
          line_type: trust.lineType,
          sim_swap: {
            detected: trust.simSwap?.swapDetected || false,
            days_since: trust.simSwap?.daysSinceSwap || null,
          },
          identity_match: identityMatch
            ? {
                first_name: identityMatch.firstNameMatch || false,
                last_name: identityMatch.lastNameMatch || false,
                overall: identityMatch.nameMatch || false,
              }
            : null,
          verified_at: new Date().toISOString(),
        },
      },
    });

    console.log(
      `Prove verification complete for ${identity_id}: score=${trust.trustScore}`
    );
  } catch (err) {
    console.error(`Prove verification failed for ${identity_id}: ${err.message}`);
  }
});

app.listen(3000);
```

## Webhook Architecture

```
Pre-Registration (Blocking):
┌────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│  User  │──▶│  Ory     │──▶│  Webhook │──▶│  Prove   │
│  Form  │   │  Before  │   │  Handler │   │  Trust   │
│        │   │  Hook    │   │          │   │  API     │
│        │◀──│◀─ block ─│◀──│◀── risk ─│◀──│          │
│        │   │  or pass │   │  score   │   │          │
└────────┘   └──────────┘   └──────────┘   └──────────┘

Post-Registration (Async):
┌────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│  User  │──▶│  Ory     │──▶│  Webhook │──▶│  Prove   │
│  Form  │   │  After   │   │  Handler │   │  Identity│
│        │◀──│  Hook    │   │  (async) │   │  API     │
│ (done) │   │  (200)   │   │          │   │          │
└────────┘   └──────────┘   └────┬─────┘   └──────────┘
                                  │
                                  ▼
                            ┌──────────┐
                            │  Ory     │
                            │  Admin   │
                            │  Update  │
                            └──────────┘
```

## Testing

### 1. Test Prove API

```bash
# Get token
TOKEN=$(curl -s -X POST "$PROVE_BASE_URL/token" \
  -d '{"client_id":"'$PROVE_CLIENT_ID'","client_secret":"'$PROVE_CLIENT_SECRET'","grant_type":"client_credentials"}' \
  -H "Content-Type: application/json" | jq -r '.access_token')

# Trust Score
curl -s -X POST "$PROVE_BASE_URL/v3/trust/v2" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+15551234567"}' | jq '.trustScore'
```

### 2. Test Registration Flow

1. Register with a valid phone number
2. Verify the registration completes (pre-registration check passes)
3. Check identity metadata for Prove verification results:

```bash
ory get identity <identity-id> --project <project-id> --format json | \
  jq '.metadata_public.prove'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Registration blocked** | SIM swap detected or low trust score | Verify phone number; contact support for legitimate cases |
| **Trust score always 0** | Test number or unsupported carrier | Use a real phone number on a supported US carrier |
| **Webhook timeout** | Prove API latency | Increase webhook timeout or use async post-registration pattern |
| **Identity match fails** | Name format mismatch | Ensure first/last name are sent separately, not combined |

## Resources

- [Prove Developer Documentation](https://developer.prove.com/)
- [Prove Trust Score API](https://developer.prove.com/docs/trust-score)
- [Prove Identity API](https://developer.prove.com/docs/identity)
- [Ory Webhooks Documentation](https://www.ory.sh/docs/guides/integrate-with-ory-cloud-through-webhooks)
- [Ory Identity Metadata](https://www.ory.sh/docs/kratos/manage-identities/managing-users-identities-metadata)
