# Split.io Integration with Ory Network

## Overview

Split.io is a feature delivery platform that combines feature flags with data-driven insights to measure the impact of features on key metrics. This integration passes Ory Network identity attributes to Split.io as user properties for targeting rules, enabling identity-aware feature rollouts and experimentation based on user traits, subscription tier, organization, and other identity data.

Key integration capabilities:
- Ory session traits mapped to Split.io user attributes for targeting
- Stable Ory identity IDs used as Split traffic keys for consistent bucketing
- Identity-based traffic allocation and percentage rollouts
- SDK wrapper that populates Split context from Ory sessions

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │
│   User       │─1─▶│  Your App    │─2─▶│  Ory Network │
│   Request    │    │  (Backend)   │    │  /sessions/  │
│              │    │              │    │  whoami      │
└──────────────┘    └──────┬───────┘    └──────────────┘
                           │
                           3 (evaluate split with Ory context)
                           │
                    ┌──────▼───────┐
                    │  Split.io    │
                    │  SDK         │
                    │  (Server)    │
                    └──────────────┘

Flow:
1. User makes request to your application
2. App validates session with Ory and retrieves identity traits
3. App evaluates feature splits using Split SDK with Ory identity as key/attributes
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Provides identity traits and metadata used as Split targeting attributes. |
| **Ory Network Sessions** | Session validation provides authenticated user context for split evaluation. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **Split.io Account**: Active Split.io subscription
- **Split SDK Key**: Server-side API key from Split admin settings

## Configuration

### Step 1: Install Split SDK

```bash
# Node.js
npm install @splitsoftware/splitio

# Go
go get github.com/splitio/go-client/v6

# Python
pip install splitio-client
```

### Step 2: Create SDK Wrapper with Ory Context

```javascript
const SplitFactory = require("@splitsoftware/splitio").SplitFactory;
const axios = require("axios");

const factory = SplitFactory({
  core: {
    authorizationKey: process.env.SPLIT_SDK_KEY,
  },
});

const splitClient = factory.client();

/**
 * Build Split attributes from an Ory session.
 */
function buildSplitAttributes(orySession) {
  const identity = orySession.identity;
  const traits = identity.traits || {};
  const metadata = identity.metadata_public || {};

  return {
    email: traits.email,
    plan: metadata.subscription_plan || "free",
    company_name: metadata.enrichment?.company?.name,
    company_size: metadata.enrichment?.company?.size,
    industry: metadata.enrichment?.company?.industry,
    country: traits.address?.country || metadata.enrichment?.person?.country,
    has_mfa:
      (identity.credentials?.totp?.identifiers?.length || 0) > 0 ||
      (identity.credentials?.webauthn?.identifiers?.length || 0) > 0,
    aal: orySession.authenticator_assurance_level,
    created_at: new Date(identity.created_at).getTime(),
    organization_id: identity.organization_id || null,
  };
}

/**
 * Evaluate a feature split using Ory session context.
 * Uses Ory identity ID as the traffic key for consistent bucketing.
 */
async function evaluateSplit(splitName, orySession, attributes) {
  await splitClient.ready();
  const key = orySession.identity.id;
  const attrs = { ...buildSplitAttributes(orySession), ...attributes };
  return splitClient.getTreatment(key, splitName, attrs);
}

/**
 * Express middleware for Split + Ory.
 */
function splitMiddleware(oryProjectUrl) {
  return async (req, res, next) => {
    try {
      const sessionCookie = req.headers.cookie;
      const { data: session } = await axios.get(
        `${oryProjectUrl}/sessions/whoami`,
        {
          headers: { Cookie: sessionCookie },
          validateStatus: (s) => s === 200 || s === 401,
        }
      );

      if (session.active) {
        req.orySession = session;
        req.splitAttributes = buildSplitAttributes(session);
        req.getTreatment = async (splitName, extraAttrs) => {
          await splitClient.ready();
          return splitClient.getTreatment(
            session.identity.id,
            splitName,
            { ...req.splitAttributes, ...extraAttrs }
          );
        };
      }
    } catch (err) {
      console.error("Split context setup failed:", err.message);
    }
    next();
  };
}

module.exports = { buildSplitAttributes, evaluateSplit, splitMiddleware, splitClient };
```

### Step 3: Use in Your Application

```javascript
const express = require("express");
const { splitMiddleware } = require("./split-ory-wrapper");

const app = express();
app.use(splitMiddleware(process.env.ORY_PROJECT_URL));

app.get("/dashboard", async (req, res) => {
  if (!req.orySession) {
    return res.redirect("/login");
  }

  const dashboardVersion = await req.getTreatment("dashboard-redesign");
  const pricingTier = await req.getTreatment("pricing-experiment");

  res.json({
    dashboard: dashboardVersion, // "on", "off", or "control"
    pricing: pricingTier,
  });
});

app.listen(3000);
```

### Step 4: Configure Targeting Rules in Split

In the Split.io dashboard, create splits with targeting rules that reference Ory attributes:

**Example targeting rules:**

| Split | Condition | Attribute | Serve |
|-------|-----------|-----------|-------|
| `dashboard-redesign` | `plan` is in list `["enterprise","business"]` | `plan` | `on` |
| `dashboard-redesign` | `company_size` >= 100 | `company_size` | `on` |
| `beta-api` | `has_mfa` is `true` | `has_mfa` | `on` |
| `geo-pricing` | `country` is in list `["US","CA","GB"]` | `country` | `tier_1` |

## Testing

### 1. Verify Attributes

```javascript
const session = await getOrySession(req);
const attrs = buildSplitAttributes(session);
console.log(JSON.stringify(attrs, null, 2));
```

### 2. Test Treatment Evaluation

```javascript
const treatment = await evaluateSplit("dashboard-redesign", session);
console.log(`Treatment: ${treatment}`); // "on", "off", or "control"
```

### 3. Verify in Split Dashboard

1. Go to **Live tail** in Split dashboard
2. Filter by your Ory identity ID
3. Verify correct treatments are served

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **All treatments return "control"** | SDK not ready | Await `splitClient.ready()` before evaluation |
| **Targeting not working** | Attribute type mismatch | Ensure numeric values are numbers, not strings |
| **Inconsistent bucketing** | Different keys used | Always use `identity.id` as the Split key |
| **Missing attributes** | Session not populated | Verify Ory session contains expected traits |

## Resources

- [Split.io Node.js SDK](https://help.split.io/hc/en-us/articles/360020564931-Node-js-SDK)
- [Split.io Targeting Rules](https://help.split.io/hc/en-us/articles/360020528072-Create-a-split)
- [Split.io Attributes](https://help.split.io/hc/en-us/articles/360020793231-Attributes)
- [Ory Sessions API](https://www.ory.sh/docs/kratos/session-management/overview)
- [Ory Identity Schema](https://www.ory.sh/docs/kratos/manage-identities/identity-schema)
