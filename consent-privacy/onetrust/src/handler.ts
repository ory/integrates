/**
 * OneTrust <> Ory Actions Webhook Handler
 *
 * Two integration points:
 *   1. Post-registration: records consent receipt in OneTrust when user registers
 *   2. DSR callback: handles Data Subject Requests (deletion/export) from OneTrust
 *      by calling Ory's admin API to delete or export the identity
 *
 * The client-side consent preferences are passed via Ory's transient_payload:
 *   { "transient_payload": { "consent": { "marketing": true, "analytics": false } } }
 *
 * SECURITY: Store ONETRUST_API_KEY and ORY_ADMIN_API_KEY in a secret manager.
 */

import express from "express";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3008", 10);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const ONETRUST_API_URL = process.env.ONETRUST_API_URL || "https://app.onetrust.com/api";

interface OryWebhookPayload {
  identity: {
    id: string;
    traits: { email: string; [key: string]: unknown };
    metadata_public?: Record<string, unknown>;
  };
  flow: {
    id: string;
    type: string;
    transient_payload?: {
      consent?: Record<string, boolean>;
      [key: string]: unknown;
    };
  };
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

// --- OneTrust API ---

async function recordConsentReceipt(
  email: string,
  identityId: string,
  consentPreferences: Record<string, boolean>,
): Promise<void> {
  // IMPORTANT: Store ONETRUST_API_KEY in a secret manager.
  const apiKey = process.env.ONETRUST_API_KEY;
  if (!apiKey) {
    console.error("ONETRUST_API_KEY not set. Store it in a secret manager.");
    return;
  }

  // Map consent booleans to OneTrust purpose IDs
  // These IDs come from your OneTrust consent configuration
  const purposes = Object.entries(consentPreferences).map(([key, granted]) => ({
    Id: getPurposeId(key),
    Name: key,
    TransactionType: granted ? "CONFIRMED" : "OPT_OUT",
  }));

  const receipt = {
    identifier: email,
    identifierType: "email",
    requestInformation: {
      language: "en-us",
      collectionPoint: "registration",
    },
    purposes,
    dsDataElements: [
      { Name: "ory_identity_id", Value: identityId },
    ],
    consentDate: new Date().toISOString(),
  };

  const res = await fetch(`${ONETRUST_API_URL}/consentmanager/v2/consent-receipts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(receipt),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OneTrust API error: ${res.status} - ${text}`);
  }
}

function getPurposeId(purposeName: string): string {
  // Map your consent category names to OneTrust purpose IDs.
  // Configure these via environment variables in production.
  const mapping: Record<string, string> = {
    marketing: process.env.ONETRUST_PURPOSE_MARKETING || "purpose-marketing-id",
    analytics: process.env.ONETRUST_PURPOSE_ANALYTICS || "purpose-analytics-id",
    functional: process.env.ONETRUST_PURPOSE_FUNCTIONAL || "purpose-functional-id",
    essential: process.env.ONETRUST_PURPOSE_ESSENTIAL || "purpose-essential-id",
  };
  return mapping[purposeName] || `purpose-${purposeName}`;
}

// --- Routes ---

/** Post-registration: record consent in OneTrust */
app.post(
  "/webhooks/onetrust/registration",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    // Store consent categories in identity metadata
    const payload = req.body as OryWebhookPayload;
    const consent = payload.flow.transient_payload?.consent;

    if (consent) {
      res.status(200).json({
        identity: {
          metadata_public: {
            consent: {
              preferences: consent,
              recorded_at: new Date().toISOString(),
            },
          },
        },
      });
    } else {
      res.status(200).json({});
    }

    // Async: record in OneTrust
    if (consent) {
      try {
        await recordConsentReceipt(
          payload.identity.traits.email,
          payload.identity.id,
          consent,
        );
        console.log(`OneTrust: recorded consent for ${payload.identity.id}`);
      } catch (err) {
        console.warn(`OneTrust consent recording failed: ${(err as Error).message}`);
      }
    }
  },
);

/**
 * POST /webhooks/onetrust/dsr
 *
 * Data Subject Request callback from OneTrust.
 * When a user exercises their right to deletion or data export,
 * OneTrust calls this endpoint, which then calls Ory's admin API.
 */
app.post(
  "/webhooks/onetrust/dsr",
  async (req: express.Request, res: express.Response): Promise<void> => {
    const oryApiKey = process.env.ORY_ADMIN_API_KEY;
    const oryUrl = process.env.ORY_SDK_URL;

    if (!oryApiKey || !oryUrl) {
      res.status(500).json({ error: "ORY_SDK_URL and ORY_ADMIN_API_KEY required" });
      return;
    }

    const { requestType, identifier } = req.body;

    try {
      // Look up identity by email
      const searchRes = await fetch(
        `${oryUrl}/admin/identities?credentials_identifier=${encodeURIComponent(identifier)}`,
        { headers: { Authorization: `Bearer ${oryApiKey}` } },
      );

      if (!searchRes.ok) {
        res.status(404).json({ error: "Identity not found" });
        return;
      }

      const identities = await searchRes.json();
      if (!Array.isArray(identities) || identities.length === 0) {
        res.status(404).json({ error: "Identity not found" });
        return;
      }

      const identityId = identities[0].id;

      if (requestType === "DELETE" || requestType === "ERASURE") {
        // Delete the identity from Ory
        const deleteRes = await fetch(
          `${oryUrl}/admin/identities/${identityId}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${oryApiKey}` },
          },
        );

        if (!deleteRes.ok) {
          throw new Error(`Failed to delete identity: ${deleteRes.status}`);
        }

        console.log(`OneTrust DSR: deleted identity ${identityId}`);
        res.status(200).json({ status: "completed", action: "deleted" });
      } else if (requestType === "EXPORT" || requestType === "ACCESS") {
        // Export identity data
        res.status(200).json({
          status: "completed",
          action: "exported",
          data: identities[0],
        });
      } else {
        res.status(400).json({ error: `Unsupported request type: ${requestType}` });
      }
    } catch (err) {
      console.error(`OneTrust DSR failed: ${(err as Error).message}`);
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", integration: "onetrust" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`OneTrust webhook handler listening on port ${PORT}`);
  });
}

export { app };
