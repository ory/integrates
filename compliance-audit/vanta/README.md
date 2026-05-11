# Vanta Integration with Ory Network

## Overview

Vanta is an automated security and compliance platform that continuously monitors an organization's security posture to streamline SOC 2, ISO 27001, HIPAA, and other compliance frameworks. This integration connects Vanta to Ory Network's admin API to collect evidence related to identity and access management controls, enabling automated compliance reporting without manual evidence gathering.

Vanta's identity-related compliance checks include:
- MFA enforcement verification across all user accounts
- Password policy strength validation
- Access review evidence (who has access to what, and when it was last reviewed)
- User lifecycle management (onboarding/offboarding audit trails)
- Session management policy verification

## Integration Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Vanta Agent   │────1───▶│  Evidence       │────2───▶│   Ory Network   │
│   (Scheduled)   │         │  Collector      │         │   Admin API     │
│                 │◀───3────│  (Your Service) │◀───3────│                 │
│                 │         │                 │         │                 │
└─────────────────┘         └────────┬────────┘         └─────────────────┘
                                     │
                                     4
                                     │
                            ┌────────▼────────┐
                            │  Vanta API      │
                            │  Evidence Push  │
                            │  (Custom        │
                            │  Integration)   │
                            └─────────────────┘

Flow:
1. Vanta triggers evidence collection on a schedule (daily or on-demand)
2. Evidence collector queries Ory Network Admin API for identity/policy data
3. Ory returns current configuration and identity data
4. Collector formats and pushes evidence to Vanta via Custom Integration API
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Provides identity data, password policy configuration, MFA enrollment status, and session management policies. |
| **Ory Network Admin API** | Supplies project configuration, identity schemas, and security settings for compliance evidence. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **Ory API Key**: An admin-level API key with read access to identities and project configuration
- **Vanta Account**: An active Vanta subscription with Custom Integration access
- **Vanta API Token**: Generated from Vanta Dashboard under Integrations > Custom Integrations
- **Evidence Collector Service**: A server or serverless function to poll Ory and push to Vanta (e.g., AWS Lambda, Cloud Run)

## Configuration

### Step 1: Create Ory Network API Key

```bash
ory create api-key \
  --project <project-id> \
  --name "Vanta Compliance Evidence Collector" \
  --read
```

Save the returned API key securely. This key will be used by the evidence collector.

### Step 2: Set Up Vanta Custom Integration

1. Log in to [Vanta Dashboard](https://app.vanta.com/)
2. Navigate to **Integrations > Custom Integrations**
3. Click **Create Custom Integration**
4. Name it "Ory Network Identity Provider"
5. Note the **Integration ID** and generate an **API Token**

### Step 3: Deploy Evidence Collector

The evidence collector is a service that periodically queries Ory and pushes evidence to Vanta. Below is a reference implementation.

**Environment variables:**

```bash
ORY_PROJECT_URL=https://<your-project-slug>.projects.oryapis.com
ORY_API_KEY=ory_pat_...
VANTA_API_TOKEN=vnt_...
VANTA_INTEGRATION_ID=int_...
COLLECTION_INTERVAL_HOURS=24
```

**Evidence collection script (Node.js):**

```javascript
const axios = require("axios");

const oryClient = axios.create({
  baseURL: process.env.ORY_PROJECT_URL,
  headers: { Authorization: `Bearer ${process.env.ORY_API_KEY}` },
});

const vantaClient = axios.create({
  baseURL: "https://api.vanta.com/v1",
  headers: { Authorization: `Bearer ${process.env.VANTA_API_TOKEN}` },
});

async function collectMfaEnforcementEvidence() {
  // Fetch project configuration to verify MFA settings
  const { data: project } = await oryClient.get("/admin/projects/current");

  const mfaConfig = project.services.identity.config.selfservice.methods.totp;
  const webauthnConfig =
    project.services.identity.config.selfservice.methods.webauthn;

  return {
    resource_id: "ory-mfa-enforcement",
    resource_name: "Ory Network MFA Policy",
    description: "MFA enforcement configuration in Ory Network",
    collected_at: new Date().toISOString(),
    evidence: {
      totp_enabled: mfaConfig?.enabled || false,
      webauthn_enabled: webauthnConfig?.enabled || false,
      aal2_required:
        project.services.identity.config.session?.whoami?.required_aal ===
        "aal2",
      project_id: project.id,
    },
    status:
      (mfaConfig?.enabled || webauthnConfig?.enabled) &&
      project.services.identity.config.session?.whoami?.required_aal === "aal2"
        ? "PASS"
        : "FAIL",
  };
}

async function collectPasswordPolicyEvidence() {
  const { data: project } = await oryClient.get("/admin/projects/current");
  const passwordConfig =
    project.services.identity.config.selfservice.methods.password?.config || {};

  return {
    resource_id: "ory-password-policy",
    resource_name: "Ory Network Password Policy",
    description: "Password strength requirements in Ory Network",
    collected_at: new Date().toISOString(),
    evidence: {
      min_length:
        passwordConfig.min_password_length || 8,
      haveibeenpwned_enabled:
        passwordConfig.haveibeenpwned_enabled !== false,
      max_breaches: passwordConfig.max_breaches || 0,
      identifier_similarity_check:
        passwordConfig.identifier_similarity_check_enabled !== false,
    },
    status:
      (passwordConfig.min_password_length || 8) >= 10 &&
      passwordConfig.haveibeenpwned_enabled !== false
        ? "PASS"
        : "FAIL",
  };
}

async function collectAccessReviewEvidence() {
  // Fetch all identities with pagination
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

  // Check MFA enrollment per identity
  const mfaEnrollment = identities.map((id) => ({
    identity_id: id.id,
    email: id.traits?.email,
    has_mfa:
      (id.credentials?.totp?.identifiers?.length || 0) > 0 ||
      (id.credentials?.webauthn?.identifiers?.length || 0) > 0,
    created_at: id.created_at,
    updated_at: id.updated_at,
    state: id.state,
  }));

  const enrolledCount = mfaEnrollment.filter((u) => u.has_mfa).length;

  return {
    resource_id: "ory-access-review",
    resource_name: "Ory Network User Access Review",
    description: `Access review for ${identities.length} identities`,
    collected_at: new Date().toISOString(),
    evidence: {
      total_identities: identities.length,
      active_identities: identities.filter((i) => i.state === "active").length,
      inactive_identities: identities.filter((i) => i.state === "inactive")
        .length,
      mfa_enrolled: enrolledCount,
      mfa_enrollment_rate:
        identities.length > 0
          ? ((enrolledCount / identities.length) * 100).toFixed(1) + "%"
          : "N/A",
    },
    status: enrolledCount === identities.length ? "PASS" : "WARNING",
  };
}

async function pushEvidenceToVanta(evidence) {
  await vantaClient.post(
    `/integrations/${process.env.VANTA_INTEGRATION_ID}/evidence`,
    { evidence: [evidence] }
  );
  console.log(`Pushed evidence: ${evidence.resource_id} (${evidence.status})`);
}

async function main() {
  const evidenceCollectors = [
    collectMfaEnforcementEvidence,
    collectPasswordPolicyEvidence,
    collectAccessReviewEvidence,
  ];

  for (const collector of evidenceCollectors) {
    try {
      const evidence = await collector();
      await pushEvidenceToVanta(evidence);
    } catch (err) {
      console.error(`Evidence collection failed: ${err.message}`);
    }
  }
}

main();
```

### Step 4: Schedule Evidence Collection

**AWS Lambda (EventBridge schedule):**
```bash
aws events put-rule \
  --name "ory-vanta-evidence-daily" \
  --schedule-expression "rate(24 hours)"
```

**Cron (on any Linux/macOS server):**
```bash
0 2 * * * /usr/bin/node /opt/evidence-collector/collect.js >> /var/log/vanta-collector.log 2>&1
```

## SOC 2 Control Mapping

| SOC 2 Control | Trust Service Criteria | Ory Evidence |
|---------------|----------------------|--------------|
| **CC6.1** — Logical access security | Security | MFA enforcement policy, AAL2 requirement |
| **CC6.2** — User authentication | Security | Password policy (length, breach check, similarity check) |
| **CC6.3** — Access authorization | Security | Identity states (active/inactive), role assignments |
| **CC6.6** — System boundary protection | Security | Session timeout configuration, cookie security settings |
| **CC6.7** — Data transmission protection | Security | TLS enforcement on Ory Network endpoints |
| **CC6.8** — Unauthorized access prevention | Security | Account lockout policies, brute-force protection |
| **CC7.2** — Monitoring for anomalies | Security | Login event audit trails, session monitoring |
| **CC8.1** — Change management | Security | Identity schema version history, configuration audit log |

## Testing

### 1. Verify Ory API Access

```bash
curl -s -H "Authorization: Bearer $ORY_API_KEY" \
  "$ORY_PROJECT_URL/admin/identities?page_size=1" | jq '.[0].id'
```

### 2. Test Evidence Collection Locally

```bash
node collect.js
```

Expected output:
```
Pushed evidence: ory-mfa-enforcement (PASS)
Pushed evidence: ory-password-policy (PASS)
Pushed evidence: ory-access-review (WARNING)
```

### 3. Verify in Vanta Dashboard

1. Navigate to **Integrations > Custom Integrations**
2. Click on "Ory Network Identity Provider"
3. Verify evidence records appear with correct status

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **401 Unauthorized from Ory** | Invalid or expired API key | Regenerate the API key with `ory create api-key` |
| **403 Forbidden from Vanta** | Invalid Vanta API token | Regenerate token in Vanta Dashboard |
| **Empty identity list** | API key lacks admin read scope | Ensure the key was created with `--read` flag |
| **Evidence shows FAIL for MFA** | MFA not enforced at session level | Set `required_aal` to `aal2` in Ory project config |
| **Stale evidence in Vanta** | Collection schedule not running | Check cron/Lambda execution logs |

## Resources

- [Vanta Custom Integrations API](https://developer.vanta.com/docs/custom-integrations)
- [Ory Network Admin API Reference](https://www.ory.sh/docs/reference/api)
- [Ory CLI Reference](https://www.ory.sh/docs/cli)
- [SOC 2 Trust Services Criteria](https://www.aicpa.org/topic/audit-assurance/audit-and-assurance-greater-than-soc-2)
