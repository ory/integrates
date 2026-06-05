# LaunchDarkly Integration with Ory Network

## Overview

LaunchDarkly is a feature management platform that enables teams to control feature rollouts, run experiments, and manage feature flags at scale. This integration passes Ory Network session traits and identity attributes as LaunchDarkly user context, enabling identity-aware feature flag evaluation based on user properties, organization membership, subscription tier, and other identity metadata.

Key integration capabilities:
- Ory session traits mapped to LaunchDarkly user context for targeting rules
- Identity-aware percentage rollouts based on stable Ory identity IDs
- Organization-based feature gating using Ory organization membership
- SDK wrapper that automatically populates LaunchDarkly context from Ory sessions

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │
│   User       │─1─▶│  Your App    │─2─▶│  Ory Network │
│   Request    │    │  (Backend)   │    │  /sessions/  │
│              │    │              │    │  whoami      │
│              │    │              │    │              │
└──────────────┘    └──────┬───────┘    └──────────────┘
                           │
                           3 (evaluate flag with Ory context)
                           │
                    ┌──────▼───────┐
                    │  LaunchDarkly│
                    │  SDK         │
                    │  (Server)    │
                    └──────────────┘

Flow:
1. User makes request to your application
2. App validates session with Ory and retrieves identity traits
3. App evaluates feature flags using LaunchDarkly SDK with Ory identity as context
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Provides identity traits and metadata used as LaunchDarkly targeting attributes. |
| **Ory Network Sessions** | Session validation provides authenticated user context for flag evaluation. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **LaunchDarkly Account**: Active LaunchDarkly subscription
- **LaunchDarkly SDK Key**: Server-side SDK key from LaunchDarkly project settings
- **LaunchDarkly Client-Side ID**: For client-side SDK usage (optional)

## Configuration

### Step 1: Install LaunchDarkly SDK

```bash
# Node.js
npm install @launchdarkly/node-server-sdk

# Go
go get github.com/launchdarkly/go-server-sdk/v7

# Python
pip install launchdarkly-server-sdk
```

### Step 2: Create SDK Wrapper with Ory Context

**Node.js SDK wrapper:**
**Docs page:** [ory.com/docs/integrates-with/feature-flags/launchdarkly](https://www.ory.com/docs/integrates-with/feature-flags/launchdarkly)

```javascript
const LaunchDarkly = require("@launchdarkly/node-server-sdk");
const axios = require("axios");

const ldClient = LaunchDarkly.init(process.env.LAUNCHDARKLY_SDK_KEY);

/**
 * Build a LaunchDarkly context from an Ory session.
 * Maps Ory identity traits and metadata to LD context attributes.
 */
function buildLDContext(orySession) {
  const identity = orySession.identity;
  const traits = identity.traits || {};
  const metadata = identity.metadata_public || {};

  // Multi-context: user + organization (if applicable)
  const contexts = [
    {
      kind: "user",
      key: identity.id,
      email: traits.email,
      name: [traits.name?.first, traits.name?.last].filter(Boolean).join(" "),
      firstName: traits.name?.first,
      lastName: traits.name?.last,
      // Custom attributes from traits/metadata
      plan: metadata.subscription_plan || "free",
      companyName: metadata.enrichment?.company?.name,
      companySize: metadata.enrichment?.company?.size,
      industry: metadata.enrichment?.company?.industry,
      country: traits.address?.country || metadata.enrichment?.person?.country,
      hasMfa:
        (identity.credentials?.totp?.identifiers?.length || 0) > 0 ||
        (identity.credentials?.webauthn?.identifiers?.length || 0) > 0,
      aal: orySession.authenticator_assurance_level,
      createdAt: identity.created_at,
    },
  ];

  // Add organization context if available
  if (orySession.identity.organization_id) {
    contexts.push({
      kind: "organization",
      key: orySession.identity.organization_id,
      name: metadata.organization_name,
    });
  }

  if (contexts.length === 1) {
    return contexts[0];
  }

  return {
    kind: "multi",
    ...Object.fromEntries(contexts.map((c) => [c.kind, c])),
  };
}

/**
 * Evaluate a feature flag using Ory session context.
 */
async function evaluateFlag(flagKey, orySession, defaultValue) {
  await ldClient.waitForInitialization();
  const context = buildLDContext(orySession);
  return ldClient.variation(flagKey, context, defaultValue);
}

/**
 * Express middleware that adds feature flag evaluation to req.
 */
function featureFlagMiddleware(oryProjectUrl) {
  return async (req, res, next) => {
    try {
      // Get Ory session
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
        req.ldContext = buildLDContext(session);
        req.featureFlag = async (key, defaultValue) => {
          await ldClient.waitForInitialization();
          return ldClient.variation(key, req.ldContext, defaultValue);
        };
      }
    } catch (err) {
      console.error("Feature flag context setup failed:", err.message);
    }

    next();
  };
}

module.exports = { buildLDContext, evaluateFlag, featureFlagMiddleware, ldClient };
```

### Step 3: Use in Your Application

```javascript
const express = require("express");
const { featureFlagMiddleware } = require("./ld-ory-wrapper");

const app = express();

app.use(
  featureFlagMiddleware(process.env.ORY_PROJECT_URL)
);

app.get("/dashboard", async (req, res) => {
  if (!req.orySession) {
    return res.redirect("/login");
  }

  // Evaluate flags using Ory identity context
  const showNewDashboard = await req.featureFlag("new-dashboard", false);
  const showBetaFeatures = await req.featureFlag("beta-features", false);
  const maxApiCalls = await req.featureFlag("api-rate-limit", 1000);

  res.json({
    dashboard_version: showNewDashboard ? "v2" : "v1",
    beta_features: showBetaFeatures,
    api_rate_limit: maxApiCalls,
  });
});

app.listen(3000);
```

### Step 4: Configure Targeting Rules in LaunchDarkly

In the LaunchDarkly dashboard, create targeting rules that reference Ory identity attributes:

**Example targeting rules:**

| Rule | Attribute | Operator | Value | Variation |
|------|-----------|----------|-------|-----------|
| Enterprise users | `plan` | is one of | `enterprise`, `business` | `true` |
| Large companies | `companySize` | greater than | `500` | `true` |
| Specific org | `organization.key` | is | `org-uuid-123` | `true` |
| MFA users only | `hasMfa` | is | `true` | `true` |
| High assurance | `aal` | is | `aal2` | `true` |
| Country rollout | `country` | is one of | `US`, `CA` | `true` |

### Step 5: Client-Side Integration (Optional)

For client-side flag evaluation, pass Ory session context to the LaunchDarkly client SDK:

```javascript
// Server-side: generate client-side LD bootstrap
app.get("/api/feature-flags", async (req, res) => {
  if (!req.orySession) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  await ldClient.waitForInitialization();
  const context = buildLDContext(req.orySession);
  const allFlags = await ldClient.allFlagsState(context);

  res.json({
    context: {
      kind: "user",
      key: req.orySession.identity.id,
      email: req.orySession.identity.traits.email,
    },
    bootstrap: allFlags.toJSON(),
  });
});
```

```javascript
// Client-side: initialize LD with bootstrapped flags
import * as LDClient from "launchdarkly-js-client-sdk";

const response = await fetch("/api/feature-flags");
const { context, bootstrap } = await response.json();

const ldClient = LDClient.initialize(
  "YOUR_CLIENT_SIDE_ID",
  context,
  { bootstrap }
);
```

## Testing

### 1. Verify Context Mapping

```javascript
// Log the LD context to verify attributes
const session = await getOrySession(req);
const context = buildLDContext(session);
console.log(JSON.stringify(context, null, 2));
```

### 2. Test Flag Evaluation

```javascript
const result = await evaluateFlag("new-dashboard", session, false);
console.log(`new-dashboard flag: ${result}`);
```

### 3. Verify in LaunchDarkly

1. Go to **Users** in LaunchDarkly dashboard
2. Search for your Ory identity ID
3. Verify attributes (email, plan, companySize, etc.) are present

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **All flags return defaults** | SDK not initialized | Await `ldClient.waitForInitialization()` |
| **Missing user attributes** | Session traits not populated | Verify Ory identity schema includes required traits |
| **Context key is undefined** | Session not validated | Check that Ory session is active before building context |
| **Targeting rules not matching** | Attribute type mismatch | Ensure numeric attributes are sent as numbers, not strings |
| **Organization context missing** | User not in an organization | Only add organization context when `organization_id` exists |

## Resources

- [LaunchDarkly Node.js SDK](https://docs.launchdarkly.com/sdk/server-side/node-js)
- [LaunchDarkly Contexts](https://docs.launchdarkly.com/home/contexts)
- [LaunchDarkly Targeting Rules](https://docs.launchdarkly.com/home/flags/targeting)
- [Ory Sessions API](https://www.ory.sh/docs/kratos/session-management/overview)
- [Ory Identity Schema](https://www.ory.sh/docs/kratos/manage-identities/identity-schema)
