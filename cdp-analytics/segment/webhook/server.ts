// SPDX-License-Identifier: Apache-2.0
//
// Segment <> Ory Actions webhook handler.
//
// Three lifecycle actions (registration, login, settings) translate the Ory
// event into Segment HTTP Tracking API calls (identify and/or track). The
// actions set response.ignore: true, so Ory doesn't wait for this handler and
// Segment availability never blocks user flows.
//
// Authenticates to Segment with HTTP Basic auth: write key as username,
// empty password.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const SEGMENT_WRITE_KEY = process.env.SEGMENT_WRITE_KEY;
const SEGMENT_API_BASE = process.env.SEGMENT_API_BASE || "https://api.segment.io/v1";
const LIBRARY_NAME = "ory-integrates/segment";
const LIBRARY_VERSION = "1.0.0";

if (!ORY_WEBHOOK_SECRET || !SEGMENT_WRITE_KEY) {
  console.error("ORY_WEBHOOK_SECRET and SEGMENT_WRITE_KEY must be set in .env");
  process.exit(1);
}

const SEGMENT_AUTH = `Basic ${Buffer.from(`${SEGMENT_WRITE_KEY}:`).toString("base64")}`;

interface OryWebhookBody {
  identity?: {
    id?: string;
    traits?: {
      email?: string;
      name?: { first?: string; last?: string } | null;
    };
    created_at?: string | null;
  };
  flow?: {
    id?: string;
    type?: string;
  };
  client_ip?: string | null;
  user_agent?: string | null;
}

interface SegmentContext {
  library: { name: string; version: string };
  ip?: string;
  userAgent?: string;
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

function messageId(): string {
  return `ory-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clientContext(body: OryWebhookBody): SegmentContext {
  const ip = body?.client_ip;
  const userAgent = body?.user_agent;
  return {
    library: { name: LIBRARY_NAME, version: LIBRARY_VERSION },
    ...(ip && { ip }),
    ...(userAgent && { userAgent }),
  };
}

function traitsFromIdentity(
  identity: OryWebhookBody["identity"],
): Record<string, unknown> {
  return {
    email: identity?.traits?.email,
    firstName: identity?.traits?.name?.first,
    lastName: identity?.traits?.name?.last,
    createdAt: identity?.created_at ?? undefined,
  };
}

async function callSegment(path: string, body: unknown): Promise<void> {
  try {
    const res = await fetch(`${SEGMENT_API_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: SEGMENT_AUTH },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`Segment ${path} ${res.status}: ${detail}`);
    }
  } catch (err) {
    console.warn(`Segment ${path} request failed: ${(err as Error).message}`);
  }
}

async function identify(
  userId: string,
  traits: Record<string, unknown>,
  context: SegmentContext,
): Promise<void> {
  await callSegment("/identify", {
    type: "identify",
    userId,
    traits,
    timestamp: new Date().toISOString(),
    messageId: messageId(),
    context,
  });
}

async function track(
  userId: string,
  event: string,
  properties: Record<string, unknown>,
  context: SegmentContext,
): Promise<void> {
  await callSegment("/track", {
    type: "track",
    userId,
    event,
    properties,
    timestamp: new Date().toISOString(),
    messageId: messageId(),
    context,
  });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Registration: identify with traits + track "User Registered" in parallel.
app.post(
  "/segment/registration",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OryWebhookBody>, res: Response) => {
    res.status(200).json({});
    const identity = req.body?.identity;
    if (!identity?.id) return;

    const ctx = clientContext(req.body);
    await Promise.all([
      identify(identity.id, traitsFromIdentity(identity), ctx),
      track(
        identity.id,
        "User Registered",
        { flow_type: req.body?.flow?.type, flow_id: req.body?.flow?.id },
        ctx,
      ),
    ]);
    console.log(`Segment: registered ${identity.id}`);
  },
);

// Login: track "User Logged In".
app.post(
  "/segment/login",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OryWebhookBody>, res: Response) => {
    res.status(200).json({});
    const identity = req.body?.identity;
    if (!identity?.id) return;

    await track(
      identity.id,
      "User Logged In",
      { flow_type: req.body?.flow?.type, flow_id: req.body?.flow?.id },
      clientContext(req.body),
    );
    console.log(`Segment: tracked login for ${identity.id}`);
  },
);

// Settings: refresh traits with identify.
app.post(
  "/segment/settings",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OryWebhookBody>, res: Response) => {
    res.status(200).json({});
    const identity = req.body?.identity;
    if (!identity?.id) return;

    await identify(identity.id, traitsFromIdentity(identity), clientContext(req.body));
    console.log(`Segment: updated traits for ${identity.id}`);
  },
);

app.listen(PORT, () => {
  console.log(`Segment webhook listening on port ${PORT}`);
});
