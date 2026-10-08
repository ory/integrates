// SPDX-License-Identifier: Apache-2.0
//
// Clearbit <> Ory Actions webhook handler (DEPRECATED).
//
// HubSpot acquired Clearbit in late 2023 and has folded its capabilities into
// Breeze Intelligence, which is a HubSpot CRM UI feature, not an external API.
// Standalone Clearbit API access is no longer offered to new customers. This
// handler is preserved for legacy Clearbit contracts only. For new
// deployments, use user-enrichment/fullcontact or user-enrichment/zoominfo.
//
// Behavior: async post-registration enrichment (response.ignore: true). The
// action runs after the identity is saved, so identity.id is the real ID. The
// handler answers 200, then calls Clearbit's Combined API and writes the
// result to metadata_admin.clearbit with a JSON Patch through Ory's Admin API.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const CLEARBIT_API_KEY = process.env.CLEARBIT_API_KEY;
const CLEARBIT_API_BASE = process.env.CLEARBIT_API_BASE || "https://person-stream.clearbit.com";
const ORY_SDK_URL = process.env.ORY_SDK_URL;
const ORY_ADMIN_API_KEY = process.env.ORY_ADMIN_API_KEY;

if (!ORY_WEBHOOK_SECRET || !CLEARBIT_API_KEY || !ORY_SDK_URL || !ORY_ADMIN_API_KEY) {
  console.error(
    "ORY_WEBHOOK_SECRET, CLEARBIT_API_KEY, ORY_SDK_URL, and ORY_ADMIN_API_KEY must be set in .env",
  );
  process.exit(1);
}

interface OryWebhookBody {
  identity: {
    id: string;
    traits?: { email?: string | null };
  };
}

interface ClearbitCombinedResponse {
  person?: {
    name?: { fullName?: string };
    employment?: { name?: string; title?: string; role?: string; seniority?: string };
  } | null;
  company?: {
    name?: string;
    domain?: string;
    category?: { industry?: string; sector?: string };
    metrics?: { employees?: number; raised?: number; annualRevenue?: number };
    geo?: { country?: string };
  } | null;
}

interface ProjectedEnrichment {
  person: {
    name?: string;
    role?: string;
    title?: string;
    seniority?: string;
    company?: string;
  } | null;
  company: {
    name?: string;
    domain?: string;
    industry?: string;
    sector?: string;
    employees?: number;
    raised?: number;
    annual_revenue?: number;
    country?: string;
  } | null;
  enriched_at: string;
}

interface OryIdentity {
  id: string;
  metadata_admin?: Record<string, unknown> | null;
}

const app = express();
app.use(express.json());

function verifyWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const provided = req.header("x-webhook-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(ORY_WEBHOOK_SECRET as string);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: "invalid webhook secret" });
    return;
  }
  next();
}

async function enrichByEmail(email: string): Promise<ClearbitCombinedResponse | null> {
  const url = `${CLEARBIT_API_BASE}/v2/combined/find?email=${encodeURIComponent(email)}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${CLEARBIT_API_KEY}` },
    signal: AbortSignal.timeout(10000),
  });

  // 404/422 = no data found for this email; not an error
  if (res.status === 404 || res.status === 422) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Clearbit ${res.status}: ${detail}`);
  }
  return (await res.json()) as ClearbitCombinedResponse;
}

async function writeMetadata(
  identityId: string,
  enrichment: ProjectedEnrichment,
): Promise<void> {
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${ORY_ADMIN_API_KEY}`,
  };

  const getRes = await fetch(`${ORY_SDK_URL}/admin/identities/${identityId}`, {
    headers,
    signal: AbortSignal.timeout(5000),
  });
  if (!getRes.ok) throw new Error(`Ory get identity ${getRes.status}`);
  const identity = (await getRes.json()) as OryIdentity;

  // A JSON Patch can't add a key below a null metadata_admin, so initialize
  // it in that case. Otherwise only the clearbit key changes.
  const patch =
    identity.metadata_admin && typeof identity.metadata_admin === "object"
      ? [{ op: "add", path: "/metadata_admin/clearbit", value: enrichment }]
      : [{ op: "add", path: "/metadata_admin", value: { clearbit: enrichment } }];

  const patchRes = await fetch(`${ORY_SDK_URL}/admin/identities/${identityId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(5000),
  });
  if (!patchRes.ok) {
    const detail = await patchRes.text().catch(() => "");
    throw new Error(`Ory patch identity ${patchRes.status}: ${detail}`);
  }
}

function projectEnrichment(raw: ClearbitCombinedResponse): ProjectedEnrichment {
  return {
    person: raw.person
      ? {
          name: raw.person.name?.fullName,
          role: raw.person.employment?.role,
          title: raw.person.employment?.title,
          seniority: raw.person.employment?.seniority,
          company: raw.person.employment?.name,
        }
      : null,
    company: raw.company
      ? {
          name: raw.company.name,
          domain: raw.company.domain,
          industry: raw.company.category?.industry,
          sector: raw.company.category?.sector,
          employees: raw.company.metrics?.employees,
          raised: raw.company.metrics?.raised,
          annual_revenue: raw.company.metrics?.annualRevenue,
          country: raw.company.geo?.country,
        }
      : null,
    enriched_at: new Date().toISOString(),
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/clearbit/registration",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OryWebhookBody>, res: Response) => {
    res.status(200).json({});

    const identity = req.body?.identity;
    const email = identity?.traits?.email;
    if (!identity?.id || !email) return;

    try {
      const raw = await enrichByEmail(email);
      if (!raw) {
        console.log(`Clearbit: no data for ${email}`);
        return;
      }
      await writeMetadata(identity.id, projectEnrichment(raw));
      console.log(`Clearbit: enriched ${identity.id} (${raw.company?.name ?? "no company"})`);
    } catch (err) {
      console.warn(`Clearbit enrichment failed for ${identity.id}: ${(err as Error).message}`);
    }
  },
);

app.listen(PORT, () => {
  console.log(`Clearbit webhook listening on port ${PORT}`);
});
