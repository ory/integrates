/**
 * Zendesk <> Ory Actions Webhook Handler
 *
 * Syncs Ory identity data to Zendesk users on registration and profile updates.
 * This enables support agents to see identity context (plan, MFA status, etc.)
 * when handling tickets.
 *
 * Endpoints:
 *   POST /webhooks/zendesk/registration — Create/update Zendesk user on registration
 *   POST /webhooks/zendesk/settings    — Update Zendesk user on profile changes
 *   GET  /api/identity/:email          — Sidebar API: lookup Ory identity by email
 *   GET  /health
 *
 * SECURITY: Store ZENDESK_API_TOKEN and ORY_ADMIN_API_KEY in a secret manager.
 */

import express from "express";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3007", 10);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const ZENDESK_SUBDOMAIN = process.env.ZENDESK_SUBDOMAIN || "your-company";
const ZENDESK_EMAIL = process.env.ZENDESK_EMAIL || "admin@example.com";

interface OryWebhookPayload {
  identity: {
    id: string;
    traits: {
      email: string;
      name?: { first?: string; last?: string };
      [key: string]: unknown;
    };
    metadata_public?: Record<string, unknown>;
    metadata_admin?: Record<string, unknown>;
  };
  flow: { id: string; type: string };
}

// --- Middleware ---

function authenticateWebhook(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (!WEBHOOK_SECRET) { next(); return; }
  if (req.get("X-Webhook-Secret") !== WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// --- Zendesk API helpers ---

async function upsertZendeskUser(payload: OryWebhookPayload): Promise<void> {
  // IMPORTANT: Store ZENDESK_API_TOKEN in a secret manager.
  const apiToken = process.env.ZENDESK_API_TOKEN;
  if (!apiToken) {
    console.error("ZENDESK_API_TOKEN not set. Store it in a secret manager.");
    return;
  }

  const { identity } = payload;
  const name = [identity.traits.name?.first, identity.traits.name?.last]
    .filter(Boolean).join(" ") || identity.traits.email;

  // Zendesk create-or-update endpoint
  const url = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/users/create_or_update`;
  const authHeader = `Basic ${Buffer.from(`${ZENDESK_EMAIL}/token:${apiToken}`).toString("base64")}`;

  // Build user fields — Zendesk custom fields for identity context
  const userFields: Record<string, unknown> = {
    ory_identity_id: identity.id,
  };

  // Include billing/plan info if available
  const billing = identity.metadata_public?.billing;
  if (billing && typeof billing === "object") {
    userFields.subscription_plan = (billing as any).plan;
    userFields.subscription_status = (billing as any).status;
  }

  // Include MFA status
  const riskAssessment = identity.metadata_public?.risk_assessment;
  if (riskAssessment && typeof riskAssessment === "object") {
    userFields.risk_score = (riskAssessment as any).score;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({
      user: {
        email: identity.traits.email,
        name,
        external_id: identity.id,
        user_fields: userFields,
        verified: true,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Zendesk API error: ${res.status} - ${text}`);
  }
}

// --- Routes ---

app.post(
  "/webhooks/zendesk/registration",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    res.status(200).json({});

    try {
      await upsertZendeskUser(req.body as OryWebhookPayload);
      console.log(`Zendesk: synced user ${(req.body as OryWebhookPayload).identity.id}`);
    } catch (err) {
      console.warn(`Zendesk sync failed: ${(err as Error).message}`);
    }
  },
);

app.post(
  "/webhooks/zendesk/settings",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    res.status(200).json({});

    try {
      await upsertZendeskUser(req.body as OryWebhookPayload);
      console.log(`Zendesk: updated user ${(req.body as OryWebhookPayload).identity.id}`);
    } catch (err) {
      console.warn(`Zendesk update failed: ${(err as Error).message}`);
    }
  },
);

/**
 * GET /api/identity/:email
 *
 * Sidebar API for Zendesk apps — looks up Ory identity by email.
 * Returns identity data for support agent context.
 * Requires ORY_ADMIN_API_KEY for Ory admin API access.
 */
app.get(
  "/api/identity/:email",
  async (req: express.Request, res: express.Response): Promise<void> => {
    const oryApiKey = process.env.ORY_ADMIN_API_KEY;
    const oryUrl = process.env.ORY_SDK_URL;

    if (!oryApiKey || !oryUrl) {
      res.status(500).json({ error: "ORY_SDK_URL and ORY_ADMIN_API_KEY required" });
      return;
    }

    try {
      const email = req.params.email;
      const searchUrl = `${oryUrl}/admin/identities?credentials_identifier=${encodeURIComponent(email)}`;

      const oryRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${oryApiKey}` },
      });

      if (!oryRes.ok) {
        res.status(404).json({ error: "Identity not found" });
        return;
      }

      const identities = await oryRes.json();
      if (!Array.isArray(identities) || identities.length === 0) {
        res.status(404).json({ error: "Identity not found" });
        return;
      }

      const identity = identities[0];
      res.status(200).json({
        id: identity.id,
        email: identity.traits?.email,
        name: identity.traits?.name,
        metadata: identity.metadata_public,
        state: identity.state,
        created_at: identity.created_at,
        updated_at: identity.updated_at,
        mfa_enabled: identity.credentials
          ? Object.keys(identity.credentials).some(
              (k: string) => k === "totp" || k === "webauthn",
            )
          : false,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", integration: "zendesk" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Zendesk webhook handler listening on port ${PORT}`);
  });
}

export { app };
