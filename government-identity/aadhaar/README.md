# Aadhaar Integration with Ory Network

## Overview

Aadhaar is India's biometric identity system administered by the Unique Identification Authority of India (UIDAI). It provides a 12-digit unique identity number to over 1.3 billion Indian residents, backed by biometric (fingerprint, iris) and demographic data. Integrating Aadhaar with Ory Network requires a licensed Authentication Service Agency (ASA) and Authentication User Agency (AUA), as direct UIDAI API access is restricted to licensed entities.

Key integration capabilities:
- Aadhaar-based identity verification for Indian market applications
- Biometric and OTP-based authentication via licensed ASA/AUA
- eKYC (electronic Know Your Customer) data retrieval
- Verified demographic data stored in Ory identity metadata
- DigiLocker integration for document verification (optional)

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐
│              │    │              │    │              │    │              │    │          │
│   User       │─1─▶│  Ory Kratos  │─2─▶│  Verification│─3─▶│  ASA/AUA     │─4─▶│  UIDAI   │
│   (India)    │    │  Webhook     │    │  Service     │    │  (Licensed)  │    │  CIDR    │
│              │    │              │    │              │    │              │    │          │
│              │◀─7─│              │◀─6─│              │◀─5─│              │◀─5─│          │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────┘

Flow:
1. User registers and provides Aadhaar number for verification
2. Ory fires verification webhook
3. Your verification service calls licensed ASA/AUA API
4. ASA/AUA forwards authentication request to UIDAI CIDR
5. UIDAI validates biometric/OTP and returns auth result + eKYC data
6. Verification service updates Ory identity with verified data
7. User receives verification confirmation
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Stores verified Aadhaar attributes in identity metadata. |
| **Ory Network Webhooks** | Triggers verification workflow on registration or settings update. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **Licensed ASA/AUA or eKYC Provider**: Such as:
  - [Signzy](https://signzy.com/) — Digital identity verification
  - [Digio](https://www.digio.in/) — Aadhaar eSign and eKYC
  - [Karza Technologies](https://karza.in/) — Identity verification APIs
  - [IDfy](https://idfy.com/) — Identity verification platform
- **Provider API Credentials**: API key or client credentials from the licensed provider
- **Aadhaar Compliance**: Must comply with UIDAI guidelines and Aadhaar Act provisions

## Configuration

### Step 1: Set Up Licensed Provider

Using Signzy as an example:

1. Sign up at [Signzy](https://signzy.com/)
2. Complete KYB verification and licensing requirements
3. Obtain API credentials for Aadhaar verification
4. Note the API endpoint, API key, and callback URL format

### Step 2: Configure Verification Webhook

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/flows/registration/after/hooks/0/hook="web_hook"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/url="https://your-service.com/aadhaar/verify"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/method="POST"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/body="file:///etc/config/kratos/aadhaar-verify.jsonnet"' \
  --add '/selfservice/flows/registration/after/hooks/0/config/can_interrupt=false' \
  --add '/selfservice/flows/registration/after/hooks/0/config/response/ignore=true'
```

**Jsonnet template:**

```jsonnet
function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  phone: if std.objectHas(ctx.identity.traits, 'phone') then ctx.identity.traits.phone else null,
  aadhaar_last_four: if std.objectHas(ctx.identity.traits, 'aadhaar_last_four') then ctx.identity.traits.aadhaar_last_four else null,
}
```

### Step 3: Implement Verification Service

```javascript
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const oryAdmin = axios.create({
  baseURL: process.env.ORY_PROJECT_URL,
  headers: { Authorization: `Bearer ${process.env.ORY_API_KEY}` },
});

// Step 1: Initiate Aadhaar OTP verification
app.post("/aadhaar/initiate-otp", async (req, res) => {
  const { aadhaar_number } = req.body;

  // Validate Aadhaar number format (12 digits)
  if (!/^\d{12}$/.test(aadhaar_number)) {
    return res.status(400).json({ error: "Invalid Aadhaar number format" });
  }

  try {
    // Call licensed provider to send OTP
    const { data } = await axios.post(
      `${process.env.AADHAAR_PROVIDER_URL}/otp/generate`,
      {
        aadhaar_number: aadhaar_number,
      },
      {
        headers: { Authorization: `Bearer ${process.env.AADHAAR_PROVIDER_KEY}` },
      }
    );

    res.json({
      transaction_id: data.transaction_id,
      message: "OTP sent to Aadhaar-linked mobile number",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Step 2: Verify OTP and retrieve eKYC
app.post("/aadhaar/verify-otp", async (req, res) => {
  const { transaction_id, otp, identity_id } = req.body;

  try {
    // Verify OTP with licensed provider
    const { data: ekyc } = await axios.post(
      `${process.env.AADHAAR_PROVIDER_URL}/otp/verify`,
      {
        transaction_id: transaction_id,
        otp: otp,
        consent: "Y",
      },
      {
        headers: { Authorization: `Bearer ${process.env.AADHAAR_PROVIDER_KEY}` },
      }
    );

    if (!ekyc.success) {
      return res.status(400).json({ error: "OTP verification failed" });
    }

    // Update Ory identity with verified data
    const { data: identity } = await oryAdmin.get(
      `/admin/identities/${identity_id}`
    );

    await oryAdmin.put(`/admin/identities/${identity_id}`, {
      schema_id: identity.schema_id,
      traits: identity.traits,
      state: identity.state,
      metadata_public: {
        ...identity.metadata_public,
        aadhaar: {
          verified: true,
          name: ekyc.name || null,
          date_of_birth: ekyc.dob || null,
          gender: ekyc.gender || null,
          // Store only masked Aadhaar (last 4 digits)
          aadhaar_masked: ekyc.maskedAadhaar || null,
          // Address (if consented)
          address: ekyc.address
            ? {
                district: ekyc.address.district,
                state: ekyc.address.state,
                pincode: ekyc.address.pincode,
              }
            : null,
          verified_at: new Date().toISOString(),
          country: "IN",
        },
      },
    });

    res.json({ status: "verified", name: ekyc.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook handler for post-registration
app.post("/aadhaar/verify", async (req, res) => {
  // Mark identity as pending verification
  const { identity_id } = req.body;

  const { data: identity } = await oryAdmin.get(
    `/admin/identities/${identity_id}`
  );

  await oryAdmin.put(`/admin/identities/${identity_id}`, {
    schema_id: identity.schema_id,
    traits: identity.traits,
    state: identity.state,
    metadata_public: {
      ...identity.metadata_public,
      aadhaar: {
        verified: false,
        verification_pending: true,
      },
    },
  });

  res.status(200).json({ status: "pending" });
});

app.listen(3000);
```

## Compliance Requirements

### UIDAI Guidelines

| Requirement | Details |
|------------|---------|
| **Consent** | Explicit user consent required before each authentication |
| **Data Storage** | Full Aadhaar number must NOT be stored; only masked/last 4 digits |
| **Purpose Limitation** | Authentication data must be used only for stated purpose |
| **Licensed Entity** | Must use UIDAI-licensed ASA/AUA; direct API access prohibited |
| **Audit Trail** | Maintain authentication transaction logs for 5 years |
| **Data Localization** | Aadhaar data must be stored within India |
| **Security** | 2048-bit RSA encryption for data in transit to UIDAI |

### Aadhaar Act 2016 Compliance

- Section 8: Authentication by consent only
- Section 28: Restriction on sharing core biometric data
- Section 29: Restriction on storing core biometric data
- Section 33: Disclosure under court order only

### Data Localization Note

Ory Network is a global cloud service. When storing Aadhaar-derived data, consider:
- Store only verified status and masked identifiers in Ory metadata
- Keep full eKYC data in India-hosted infrastructure
- Use Ory webhooks to trigger India-hosted verification services

## Testing

### 1. Test with Provider Sandbox

Licensed providers offer sandbox environments:

```bash
# Test OTP generation (sandbox)
curl -X POST "$AADHAAR_PROVIDER_URL/otp/generate" \
  -H "Authorization: Bearer $AADHAAR_PROVIDER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"aadhaar_number": "999999990019"}'
```

### 2. Verify Identity Update

```bash
ory get identity <identity-id> --project <project-id> --format json | \
  jq '.metadata_public.aadhaar'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **OTP not received** | Incorrect Aadhaar-linked mobile | User must verify mobile number linked to Aadhaar |
| **eKYC data empty** | Consent not provided | Ensure `consent: "Y"` is passed in verification request |
| **Provider returns 403** | API credentials expired | Renew credentials with licensed provider |
| **Aadhaar number validation fails** | Invalid checksum | Validate Aadhaar number using Verhoeff algorithm before submission |
| **Data localization concerns** | Ory Network outside India | Store only masked/verified status in Ory; keep full data in India |

## Resources

- [UIDAI Developer Portal](https://developer.uidai.gov.in/)
- [Aadhaar Authentication API Specification](https://developer.uidai.gov.in/apiDashboard)
- [Aadhaar Act 2016](https://uidai.gov.in/legal-framework/aadhaar-act.html)
- [Signzy Aadhaar APIs](https://signzy.com/products/aadhaar-verification)
- [Ory Webhooks Documentation](https://www.ory.sh/docs/guides/integrate-with-ory-cloud-through-webhooks)
- [Ory Identity Metadata](https://www.ory.sh/docs/kratos/manage-identities/managing-users-identities-metadata)
