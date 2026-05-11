/**
 * Ory → Svix Event Router
 *
 * Receives Ory Actions webhook calls and publishes them to Svix for reliable,
 * fan-out delivery to consumer endpoints. Svix handles retries, delivery
 * monitoring, and replay.
 *
 * Architecture:
 *   Ory Actions → [this service] → Svix → Consumer endpoints (your customers)
 *
 * Each Ory identity is mapped to a Svix "application" so consumers can
 * subscribe to events for specific users or all users.
 *
 * SECURITY: Store SVIX_API_KEY in a secret manager.
 *   - Use a secret manager (Cloud Secret Manager, AWS Secrets Manager, Vault, etc.)
 */

import express from "express";
import { Svix } from "svix";
import type { OryWebhookPayload, OryEventType, SvixEventPayload } from "./types";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3005", 10);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Svix app ID — all Ory events are published under this application.
// You can also create per-tenant apps for multi-tenant scenarios.
const SVIX_APP_ID = process.env.SVIX_APP_ID || "ory-identity-events";

// --- Middleware ---

function authenticateWebhook(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (!WEBHOOK_SECRET) {
    next();
    return;
  }
  if (req.get("X-Webhook-Secret") !== WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// --- Helpers ---

let svixClient: Svix | null = null;

function getSvixClient(): Svix | null {
  if (svixClient) return svixClient;

  // IMPORTANT: Store SVIX_API_KEY in a secret manager.
  const apiKey = process.env.SVIX_API_KEY;
  if (!apiKey) {
    console.error(
      "SVIX_API_KEY not set. Store it in a secret manager.",
    );
    return null;
  }

  svixClient = new Svix(apiKey);
  return svixClient;
}

function extractClientIp(headers?: Record<string, string[]>): string | undefined {
  if (!headers) return undefined;
  return headers["x-forwarded-for"]?.[0]?.split(",")[0]?.trim();
}

function buildEventPayload(payload: OryWebhookPayload): SvixEventPayload {
  return {
    userId: payload.identity.id,
    email: payload.identity.traits.email,
    name: [
      payload.identity.traits.name?.first,
      payload.identity.traits.name?.last,
    ].filter(Boolean).join(" ") || undefined,
    flowId: payload.flow.id,
    method: payload.flow.type,
    timestamp: new Date().toISOString(),
    sourceIp: extractClientIp(payload.request_headers),
    metadata: payload.identity.metadata_public,
  };
}

async function publishEvent(
  eventType: OryEventType,
  payload: OryWebhookPayload,
): Promise<void> {
  const client = getSvixClient();
  if (!client) return;

  const eventPayload = buildEventPayload(payload);

  try {
    await client.message.create(SVIX_APP_ID, {
      eventType,
      payload: eventPayload as unknown as Record<string, unknown>,
      // Use the flow ID as the idempotency key to prevent duplicate events
      eventId: `ory-${eventType}-${payload.flow.id}`,
    });

    console.log(
      `Svix: published ${eventType} for user ${payload.identity.id}`,
    );
  } catch (err) {
    console.warn(
      `Svix: failed to publish ${eventType}: ${(err as Error).message}`,
    );
  }
}

// --- Routes ---

app.post(
  "/webhooks/svix/registration",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    res.status(200).json({});
    await publishEvent("user.registered", req.body as OryWebhookPayload);
  },
);

app.post(
  "/webhooks/svix/login",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    res.status(200).json({});
    await publishEvent("user.logged_in", req.body as OryWebhookPayload);
  },
);

app.post(
  "/webhooks/svix/settings",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    res.status(200).json({});
    await publishEvent("user.settings_updated", req.body as OryWebhookPayload);
  },
);

app.post(
  "/webhooks/svix/recovery",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    res.status(200).json({});
    await publishEvent("user.recovery_initiated", req.body as OryWebhookPayload);
  },
);

app.post(
  "/webhooks/svix/verification",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    res.status(200).json({});
    await publishEvent("user.verified", req.body as OryWebhookPayload);
  },
);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", integration: "svix" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Svix event router listening on port ${PORT}`);
  });
}

export { app };
