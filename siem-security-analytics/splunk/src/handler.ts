/**
 * Splunk <> Ory Actions Webhook Handler
 *
 * Forwards Ory identity events to Splunk via HTTP Event Collector (HEC).
 * Events are mapped to Splunk's CIM Authentication data model.
 * All hooks are ASYNCHRONOUS (fire-and-forget).
 *
 * SECURITY: The SPLUNK_HEC_TOKEN must be stored in a secret manager.
 *   - Use a secret manager (Cloud Secret Manager, AWS Secrets Manager, Vault, etc.)
 */

import express from "express";
import { SplunkHecClient } from "./splunk-client";
import {
  mapRegistrationEvent,
  mapLoginEvent,
  mapRecoveryEvent,
  mapSettingsEvent,
} from "./event-mapper";
import type { OryWebhookPayload } from "./types";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3004", 10);
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

let splunkClient: SplunkHecClient | null = null;

function getSplunkClient(): SplunkHecClient | null {
  if (splunkClient) return splunkClient;

  const hecUrl = process.env.SPLUNK_HEC_URL;
  // IMPORTANT: Store SPLUNK_HEC_TOKEN in a secret manager.
  const hecToken = process.env.SPLUNK_HEC_TOKEN;

  if (!hecUrl || !hecToken) {
    console.error(
      "SPLUNK_HEC_URL and SPLUNK_HEC_TOKEN must be set. " +
        "Store the token in a secret manager.",
    );
    return null;
  }

  splunkClient = new SplunkHecClient({
    hecUrl,
    hecToken,
    index: process.env.SPLUNK_INDEX || "ory",
    source: process.env.SPLUNK_SOURCE || "ory:actions",
    sourcetype: process.env.SPLUNK_SOURCETYPE || "ory:auth",
    host: process.env.SPLUNK_HOST || "ory-network",
  });
  return splunkClient;
}

// --- Routes ---

app.post(
  "/webhooks/splunk/registration",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    res.status(200).json({});

    const client = getSplunkClient();
    if (!client) return;

    const payload = req.body as OryWebhookPayload;
    const eventParams = mapRegistrationEvent(payload);
    const event = client.buildAuthEvent(eventParams);
    event.event.signature_id = payload.flow.id;

    await client.sendEvent(event);
    console.log(`Splunk: sent registration event for ${payload.identity.id}`);
  },
);

app.post(
  "/webhooks/splunk/login",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    res.status(200).json({});

    const client = getSplunkClient();
    if (!client) return;

    const payload = req.body as OryWebhookPayload;
    const eventParams = mapLoginEvent(payload);
    const event = client.buildAuthEvent(eventParams);
    event.event.signature_id = payload.flow.id;

    await client.sendEvent(event);
    console.log(`Splunk: sent login event for ${payload.identity.id}`);
  },
);

app.post(
  "/webhooks/splunk/recovery",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    res.status(200).json({});

    const client = getSplunkClient();
    if (!client) return;

    const payload = req.body as OryWebhookPayload;
    const eventParams = mapRecoveryEvent(payload);
    const event = client.buildAuthEvent(eventParams);
    event.event.signature_id = payload.flow.id;

    await client.sendEvent(event);
    console.log(`Splunk: sent recovery event for ${payload.identity.id}`);
  },
);

app.post(
  "/webhooks/splunk/settings",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    res.status(200).json({});

    const client = getSplunkClient();
    if (!client) return;

    const payload = req.body as OryWebhookPayload;
    const eventParams = mapSettingsEvent(payload);
    const event = client.buildAuthEvent(eventParams);
    event.event.signature_id = payload.flow.id;

    await client.sendEvent(event);
    console.log(`Splunk: sent settings event for ${payload.identity.id}`);
  },
);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", integration: "splunk" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Splunk webhook handler listening on port ${PORT}`);
  });
}

export { app };
