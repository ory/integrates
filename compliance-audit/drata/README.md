# Drata Integration with Ory Network

## Overview

Drata is an automated security and compliance platform that continuously monitors infrastructure and workflows to maintain compliance with SOC 2, ISO 27001, HIPAA, PCI DSS, GDPR, and other frameworks. This integration connects Drata to Ory Network to collect identity and access management evidence, enabling automated control monitoring and audit readiness.

Drata's identity compliance capabilities include:
- Automated evidence collection for access controls
- Continuous monitoring of MFA enforcement and password policies
- User access review workflows
- Offboarding verification (no orphaned accounts)
- Control mapping across multiple compliance frameworks simultaneously

## Integration Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Drata         │────1───▶│  Evidence       │────2───▶│   Ory Network   │
│   Platform      │         │  Collector      │         │   Admin API     │
│                 │◀───4────│  (Your Service) │◀───3────│                 │
│                 │         │                 │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘

Flow:
1. Drata triggers evidence collection via webhook or schedule
2. Evidence collector queries Ory Network Admin API
3. Ory returns identity configuration and user data
4. Collector pushes structured evidence to Drata via API
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Provides identity lifecycle data, credential policies, MFA enrollment, and session configuration. |
| **Ory Network Admin API** | Project-level configuration access for security policy evidence. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **Ory API Key**: Admin-level API key with read access
- **Drata Account**: Active Drata subscription
- **Drata API Key**: Generated from Drata under **Settings > API Keys**
- **Evidence Collector**: A service to mediate between Ory and Drata (Lambda, Cloud Run, etc.)

## Configuration

### Step 1: Create Ory API Key

```bash
ory create api-key \
  --project <project-id> \
  --name "Drata Evidence Collector" \
  --read
```

### Step 2: Configure Drata Custom Connection

1. Log in to [Drata](https://app.drata.com/)
2. Navigate to **Connections > Add Connection**
3. Select **Custom Connection** (or use the Drata Public API)
4. Generate an API key under **Settings > API Keys**

### Step 3: Deploy Evidence Collector

**Environment variables:**

```bash
ORY_PROJECT_URL=https://<your-project-slug>.projects.oryapis.com
ORY_API_KEY=ory_pat_...
DRATA_API_KEY=drata_...
DRATA_BASE_URL=https://public-api.drata.com
```

**Evidence collection script (Node.js):**

```javascript
const axios = require("axios");

const oryClient = axios.create({
  baseURL: process.env.ORY_PROJECT_URL,
  headers: { Authorization: `Bearer ${process.env.ORY_API_KEY}` },
});

const drataClient = axios.create({
  baseURL: process.env.DRATA_BASE_URL,
  headers: { Authorization: `Bearer ${process.env.DRATA_API_KEY}` },
});

async function collectIdentityEvidence() {
  const { data: project } = await oryClient.get("/admin/projects/current");
  const config = project.services.identity.config;

  // Collect all identities
  const identities = [];
  let pageToken = "";
  do {
    const { data, headers } = await oryClient.get("/admin/identities", {
      params: { page_size: 250, page_token: pageToken },
    });
    identities.push(...data);
    const linkHeader = headers["link"] || "";
    const nextMatch = linkHeader.match(/page_token=([^&>]+).*rel="next"/);
    pageToken = nextMatch ? nextMatch[1] : "";
  } while (pageToken);

  return {
    mfa_policy: {
      totp_enabled: config.selfservice.methods.totp?.enabled || false,
      webauthn_enabled: config.selfservice.methods.webauthn?.enabled || false,
      aal2_required: config.session?.whoami?.required_aal === "aal2",
    },
    password_policy: {
      min_length:
        config.selfservice.methods.password?.config?.min_password_length || 8,
      breach_check:
        config.selfservice.methods.password?.config
          ?.haveibeenpwned_enabled !== false,
      similarity_check:
        config.selfservice.methods.password?.config
          ?.identifier_similarity_check_enabled !== false,
    },
    identity_summary: {
      total: identities.length,
      active: identities.filter((i) => i.state === "active").length,
      inactive: identities.filter((i) => i.state === "inactive").length,
      with_mfa: identities.filter(
        (i) =>
          (i.credentials?.totp?.identifiers?.length || 0) > 0 ||
          (i.credentials?.webauthn?.identifiers?.length || 0) > 0
      ).length,
    },
    identities: identities.map((i) => ({
      id: i.id,
      email: i.traits?.email,
      state: i.state,
      created_at: i.created_at,
      updated_at: i.updated_at,
      has_mfa:
        (i.credentials?.totp?.identifiers?.length || 0) > 0 ||
        (i.credentials?.webauthn?.identifiers?.length || 0) > 0,
    })),
  };
}

async function pushToDrata(evidence) {
  // Push personnel/identity evidence
  await drataClient.put("/personnel", {
    personnel: evidence.identities.map((id) => ({
      uniqueId: id.id,
      email: id.email,
      startDate: id.created_at,
      isActive: id.state === "active",
      hasMfa: id.has_mfa,
      source: "ory-network",
    })),
  });

  // Push control evidence
  await drataClient.post("/evidence", {
    controlId: "access-control-mfa",
    evidenceType: "AUTOMATED",
    body: JSON.stringify(evidence.mfa_policy),
    collectedAt: new Date().toISOString(),
    result:
      evidence.mfa_policy.aal2_required &&
      (evidence.mfa_policy.totp_enabled || evidence.mfa_policy.webauthn_enabled)
        ? "PASS"
        : "FAIL",
  });

  await drataClient.post("/evidence", {
    controlId: "access-control-password",
    evidenceType: "AUTOMATED",
    body: JSON.stringify(evidence.password_policy),
    collectedAt: new Date().toISOString(),
    result:
      (evidence.password_policy.min_length >= 10) &&
      evidence.password_policy.breach_check
        ? "PASS"
        : "FAIL",
  });

  console.log(
    `Pushed ${evidence.identities.length} personnel records and 2 control evidence items to Drata`
  );
}

async function main() {
  const evidence = await collectIdentityEvidence();
  await pushToDrata(evidence);
}

main();
```

### Step 4: Schedule Collection

```bash
# Run daily at 3 AM UTC
0 3 * * * /usr/bin/node /opt/drata-collector/collect.js >> /var/log/drata-collector.log 2>&1
```

## Control Mapping

### SOC 2 Controls

| Control | Trust Service Criteria | Ory Evidence |
|---------|----------------------|--------------|
| **CC6.1** | Logical access security | MFA policy, AAL2 enforcement |
| **CC6.2** | Authentication mechanisms | Password policy, credential configuration |
| **CC6.3** | Access provisioning | Identity creation/state management |
| **CC6.6** | System boundaries | Session timeout, cookie policy |
| **CC6.8** | Unauthorized access prevention | Brute-force protection, account lockout |

### ISO 27001 Controls

| Control | Description | Ory Evidence |
|---------|-------------|--------------|
| **A.9.2.1** | User registration and de-registration | Identity lifecycle (create/deactivate) |
| **A.9.2.4** | Management of secret authentication | Password policy (length, breach check) |
| **A.9.4.2** | Secure log-on procedures | MFA enforcement, session management |
| **A.9.4.3** | Password management system | Password strength configuration |

## Testing

### 1. Verify API Connectivity

```bash
# Test Ory API
curl -s -H "Authorization: Bearer $ORY_API_KEY" \
  "$ORY_PROJECT_URL/admin/identities?page_size=1" | jq length

# Test Drata API
curl -s -H "Authorization: Bearer $DRATA_API_KEY" \
  "$DRATA_BASE_URL/personnel?limit=1" | jq '.total'
```

### 2. Run Evidence Collection

```bash
node collect.js
```

### 3. Verify in Drata

1. Navigate to **Controls** in Drata
2. Check that access control evidence shows recent timestamps
3. Navigate to **Personnel** to verify identity sync

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **401 from Ory API** | Invalid API key | Regenerate with `ory create api-key` |
| **403 from Drata API** | Insufficient Drata permissions | Ensure API key has write access to Personnel and Evidence |
| **Missing personnel in Drata** | Pagination not exhausting all identities | Verify the page_token loop completes |
| **Control shows FAIL** | Policy not meeting threshold | Update Ory project config to enforce stricter password/MFA settings |

## Resources

- [Drata Public API Documentation](https://developers.drata.com/)
- [Ory Network Admin API Reference](https://www.ory.sh/docs/reference/api)
- [Ory CLI Reference](https://www.ory.sh/docs/cli)
- [ISO 27001 Controls Reference](https://www.iso.org/standard/27001)
