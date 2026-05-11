/**
 * Segment <> Ory Actions Webhook Handler
 *
 * Sends identity events to Segment when users register, log in, or update profiles.
 * All hooks are ASYNCHRONOUS (fire-and-forget, non-blocking).
 *
 * Endpoints:
 *   POST /webhooks/segment/registration — Sends identify + track "User Registered"
 *   POST /webhooks/segment/login        — Sends track "User Logged In"
 *   POST /webhooks/segment/settings     — Sends identify with updated traits
 *   GET  /health                         — Health check
 *
 * SECURITY: The SEGMENT_WRITE_KEY must be stored in a secret manager.
 *   - Use a secret manager (Cloud Secret Manager, AWS Secrets Manager, Vault, etc.)
 */

import express from "express";
import { SegmentClient } from "./segment-client";
import type { OryWebhookPayload } from "./types";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3002", 10);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

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

let segmentClient: SegmentClient | null = null;

function getSegmentClient(): SegmentClient | null {
  if (segmentClient) return segmentClient;

  // IMPORTANT: In production, use a secret manager for SEGMENT_WRITE_KEY.
  const writeKey = process.env.SEGMENT_WRITE_KEY;
  if (!writeKey) {
    console.error(
      "SEGMENT_WRITE_KEY not set. Store it in a secret manager.",
    );
    return null;
  }

  segmentClient = new SegmentClient(writeKey);
  return segmentClient;
}

function extractContext(
  payload: OryWebhookPayload,
): { ip?: string; userAgent?: string } {
  const headers = payload.request_headers;
  if (!headers) return {};

  const ip = headers["x-forwarded-for"]?.[0]?.split(",")[0]?.trim();
  const userAgent = headers["user-agent"]?.[0];

  return { ip, userAgent };
}

function mapTraits(payload: OryWebhookPayload): Record<string, unknown> {
  const { traits } = payload.identity;
  return {
    email: traits.email,
    firstName: traits.name?.first,
    lastName: traits.name?.last,
    createdAt: payload.identity.created_at,
  };
}

// --- Routes ---

app.post(
  "/webhooks/segment/registration",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    // Return immediately — async processing
    res.status(200).json({});

    const client = getSegmentClient();
    if (!client) return;

    const payload = req.body as OryWebhookPayload;
    const userId = payload.identity.id;
    const traits = mapTraits(payload);
    const context = extractContext(payload);

    // Send identify + track in parallel
    await Promise.all([
      client.identify(userId, traits, context),
      client.track(userId, "User Registered", {
        method: payload.flow.type,
        flow_id: payload.flow.id,
      }, context),
    ]);

    console.log(`Segment: identified + tracked registration for ${userId}`);
  },
);

app.post(
  "/webhooks/segment/login",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    res.status(200).json({});

    const client = getSegmentClient();
    if (!client) return;

    const payload = req.body as OryWebhookPayload;
    const userId = payload.identity.id;
    const context = extractContext(payload);

    await client.track(userId, "User Logged In", {
      method: payload.flow.type,
      flow_id: payload.flow.id,
    }, context);

    console.log(`Segment: tracked login for ${userId}`);
  },
);

app.post(
  "/webhooks/segment/settings",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    res.status(200).json({});

    const client = getSegmentClient();
    if (!client) return;

    const payload = req.body as OryWebhookPayload;
    const userId = payload.identity.id;
    const traits = mapTraits(payload);
    const context = extractContext(payload);

    await client.identify(userId, traits, context);

    console.log(`Segment: updated traits for ${userId}`);
  },
);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", integration: "segment" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Segment webhook handler listening on port ${PORT}`);
  });
}

export { app };
