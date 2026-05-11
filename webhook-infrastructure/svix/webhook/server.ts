// SPDX-License-Identifier: Apache-2.0
//
// Ory Actions <> Svix event router.
//
// Receives Ory Action webhooks on five lifecycle endpoints and publishes the
// corresponding event to a Svix application. Svix then handles fan-out to
// consumer endpoints, automatic retries with exponential backoff, delivery
// monitoring, and replay.
//
// All five hooks are async (response.ignore: true, can_interrupt: false):
// the handler returns 200 to Ory immediately so user flows are never blocked
// by Svix availability, then publishes to Svix in the background. Each event
// uses a deterministic eventId (flow.id + event type) so retries are
// naturally idempotent at the Svix layer.
//
// We talk to Svix's REST API directly with built-in fetch rather than the
// Svix SDK so the handler stays consistent with the rest of the integration
// family and has zero non-template dependencies.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const SVIX_API_BASE = process.env.SVIX_API_BASE || "https://api.svix.com";
const SVIX_API_KEY = process.env.SVIX_API_KEY;
const SVIX_APP_ID = process.env.SVIX_APP_ID;

if (!ORY_WEBHOOK_SECRET || !SVIX_API_KEY || !SVIX_APP_ID) {
  console.error("ORY_WEBHOOK_SECRET, SVIX_API_KEY, and SVIX_APP_ID must be set in .env");
  process.exit(1);
}

interface OryWebhookBody {
  identity?: {
    id?: string;
    traits?: {
      email?: string;
      name?: { first?: string; last?: string };
    };
    metadata_public?: Record<string, unknown>;
  };
  flow?: {
    id?: string;
    type?: string;
  };
  request_headers?: Record<string, string[]>;
}

interface SvixMessagePayload {
  userId?: string;
  email?: string;
  name?: string;
  flowId?: string;
  method?: string;
  timestamp: string;
  sourceIp?: string;
  metadata?: Record<string, unknown>;
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

function extractClientIp(headers: Record<string, string[]> | undefined): string | undefined {
  const xff = headers?.["x-forwarded-for"]?.[0];
  return xff ? xff.split(",")[0]?.trim() : undefined;
}

function buildPayload(body: OryWebhookBody): SvixMessagePayload {
  const identity = body?.identity ?? {};
  const flow = body?.flow ?? {};
  const fullName = [identity.traits?.name?.first, identity.traits?.name?.last]
    .filter((s): s is string => Boolean(s))
    .join(" ");
  return {
    userId: identity.id,
    email: identity.traits?.email,
    name: fullName || undefined,
    flowId: flow.id,
    method: flow.type,
    timestamp: new Date().toISOString(),
    sourceIp: extractClientIp(body?.request_headers),
    metadata: identity.metadata_public,
  };
}

async function publish(eventType: string, body: OryWebhookBody): Promise<void> {
  const flowId = body?.flow?.id;
  const message = {
    eventType,
    payload: buildPayload(body),
    eventId: `ory-${eventType}-${flowId}`,
  };
  try {
    const res = await fetch(
      `${SVIX_API_BASE}/api/v1/app/${encodeURIComponent(SVIX_APP_ID as string)}/msg/`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${SVIX_API_KEY}`,
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`Svix ${res.status}: ${detail}`);
      return;
    }
    console.log(`Svix: published ${eventType} for ${body?.identity?.id} (flow ${flowId})`);
  } catch (err) {
    // Fire-and-forget: a Svix outage shouldn't propagate to Ory.
    console.warn(`Svix publish failed: ${(err as Error).message}`);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

function asyncHook(eventType: string) {
  return async (
    req: Request<unknown, unknown, OryWebhookBody>,
    res: Response,
  ) => {
    res.status(200).json({});
    await publish(eventType, req.body);
  };
}

app.post("/svix/registration", verifyWebhookSecret, asyncHook("ory.identity.registered"));
app.post("/svix/login", verifyWebhookSecret, asyncHook("ory.identity.logged_in"));
app.post("/svix/settings", verifyWebhookSecret, asyncHook("ory.identity.updated"));
app.post("/svix/recovery", verifyWebhookSecret, asyncHook("ory.identity.recovery_initiated"));
app.post("/svix/verification", verifyWebhookSecret, asyncHook("ory.identity.verified"));

app.listen(PORT, () => {
  console.log(`Svix router listening on port ${PORT}`);
});
