/**
 * Clearbit <> Ory Actions Webhook Handler
 *
 * Enriches B2B signups with company and person data from Clearbit.
 * Runs as an ASYNC post-registration webhook — enrichment data is written
 * back to Ory identity metadata via the admin API.
 *
 * Enrichment data stored in metadata_admin:
 *   {
 *     "clearbit": {
 *       "person": { "name", "role", "title", "seniority" },
 *       "company": { "name", "domain", "industry", "size", "raised" },
 *       "enriched_at": "2025-01-15T10:00:00Z"
 *     }
 *   }
 *
 * This data can then flow into:
 *   - Session claims for feature gating (e.g., enterprise features for large companies)
 *   - CRM sync (HubSpot/Salesforce) for sales routing
 *   - LaunchDarkly targeting rules
 *
 * SECURITY: Store CLEARBIT_API_KEY and ORY_ADMIN_API_KEY in a secret manager.
 */

import express from "express";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3009", 10);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

interface OryWebhookPayload {
  identity: {
    id: string;
    traits: { email: string; [key: string]: unknown };
    metadata_admin?: Record<string, unknown>;
  };
  flow: { id: string; type: string };
}

interface ClearbitEnrichmentResult {
  person: {
    name?: { fullName?: string; givenName?: string; familyName?: string };
    employment?: { name?: string; title?: string; role?: string; seniority?: string };
  } | null;
  company: {
    name?: string;
    domain?: string;
    category?: { industry?: string; sector?: string };
    metrics?: { employees?: number; raised?: number; annualRevenue?: number };
    geo?: { country?: string; state?: string; city?: string };
  } | null;
}

// --- Middleware ---

function authenticateWebhook(
  req: express.Request, res: express.Response, next: express.NextFunction,
): void {
  if (!WEBHOOK_SECRET) { next(); return; }
  if (req.get("X-Webhook-Secret") !== WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" }); return;
  }
  next();
}

// --- Clearbit API ---

async function enrichByEmail(email: string): Promise<ClearbitEnrichmentResult | null> {
  // IMPORTANT: Store CLEARBIT_API_KEY in a secret manager.
  const apiKey = process.env.CLEARBIT_API_KEY;
  if (!apiKey) {
    console.error("CLEARBIT_API_KEY not set. Store it in a secret manager.");
    return null;
  }

  // Clearbit Combined API — returns both person and company data
  const url = `https://person-stream.clearbit.com/v2/combined/find?email=${encodeURIComponent(email)}`;
  const authHeader = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (res.status === 404 || res.status === 422) {
    // No data found for this email — not an error
    console.log(`Clearbit: no data found for ${email}`);
    return null;
  }

  if (!res.ok) {
    throw new Error(`Clearbit API error: ${res.status}`);
  }

  return (await res.json()) as ClearbitEnrichmentResult;
}

async function updateOryIdentityMetadata(
  identityId: string,
  enrichmentData: Record<string, unknown>,
): Promise<void> {
  const oryApiKey = process.env.ORY_ADMIN_API_KEY;
  const oryUrl = process.env.ORY_SDK_URL;

  if (!oryApiKey || !oryUrl) {
    console.error("ORY_SDK_URL and ORY_ADMIN_API_KEY required for metadata update.");
    return;
  }

  // First, get the current identity to preserve existing metadata
  const getRes = await fetch(`${oryUrl}/admin/identities/${identityId}`, {
    headers: { Authorization: `Bearer ${oryApiKey}` },
  });

  if (!getRes.ok) {
    throw new Error(`Failed to fetch identity: ${getRes.status}`);
  }

  const identity = await getRes.json();
  const currentMetadata = identity.metadata_admin || {};

  // Merge enrichment data with existing metadata
  const updatedMetadata = {
    ...currentMetadata,
    ...enrichmentData,
  };

  // Update the identity metadata
  const updateRes = await fetch(`${oryUrl}/admin/identities/${identityId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${oryApiKey}`,
    },
    body: JSON.stringify({
      schema_id: identity.schema_id,
      traits: identity.traits,
      metadata_admin: updatedMetadata,
      metadata_public: identity.metadata_public,
      state: identity.state,
    }),
  });

  if (!updateRes.ok) {
    const text = await updateRes.text().catch(() => "");
    throw new Error(`Failed to update identity metadata: ${updateRes.status} - ${text}`);
  }
}

// --- Routes ---

app.post(
  "/webhooks/clearbit/registration",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    // Return immediately — async enrichment
    res.status(200).json({});

    const payload = req.body as OryWebhookPayload;
    const email = payload.identity.traits.email;

    if (!email) return;

    try {
      const enrichment = await enrichByEmail(email);

      if (!enrichment) {
        console.log(`Clearbit: no enrichment data for ${email}`);
        return;
      }

      const enrichmentData = {
        clearbit: {
          person: enrichment.person
            ? {
                name: enrichment.person.name?.fullName,
                role: enrichment.person.employment?.role,
                title: enrichment.person.employment?.title,
                seniority: enrichment.person.employment?.seniority,
                company: enrichment.person.employment?.name,
              }
            : null,
          company: enrichment.company
            ? {
                name: enrichment.company.name,
                domain: enrichment.company.domain,
                industry: enrichment.company.category?.industry,
                sector: enrichment.company.category?.sector,
                employees: enrichment.company.metrics?.employees,
                raised: enrichment.company.metrics?.raised,
                annual_revenue: enrichment.company.metrics?.annualRevenue,
                country: enrichment.company.geo?.country,
              }
            : null,
          enriched_at: new Date().toISOString(),
        },
      };

      await updateOryIdentityMetadata(payload.identity.id, enrichmentData);
      console.log(
        `Clearbit: enriched ${payload.identity.id} — ${enrichment.company?.name || "no company"}`,
      );
    } catch (err) {
      console.warn(`Clearbit enrichment failed: ${(err as Error).message}`);
    }
  },
);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", integration: "clearbit" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Clearbit enrichment handler listening on port ${PORT}`);
  });
}

export { app };
