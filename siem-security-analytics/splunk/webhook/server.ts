// SPDX-License-Identifier: Apache-2.0
//
// Splunk <> Ory Actions webhook handler.
//
// Forwards Ory identity-flow events to Splunk's HTTP Event Collector (HEC).
// All four hooks (registration, login, recovery, settings) are async
// (fire-and-forget): the handler returns 200 to Ory immediately so user
// flows are never blocked by Splunk availability, then sends the event to
// HEC in the background. Events are shaped to the Splunk CIM Authentication
// data model so search and dashboarding work without per-event extraction.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const SPLUNK_HEC_URL = process.env.SPLUNK_HEC_URL;
const SPLUNK_HEC_TOKEN = process.env.SPLUNK_HEC_TOKEN;
const SPLUNK_INDEX = process.env.SPLUNK_INDEX || "ory";
const SPLUNK_SOURCE = process.env.SPLUNK_SOURCE || "ory:actions";
const SPLUNK_SOURCETYPE = process.env.SPLUNK_SOURCETYPE || "ory:auth";
const SPLUNK_HOST = process.env.SPLUNK_HOST || "ory-network";

if (!ORY_WEBHOOK_SECRET || !SPLUNK_HEC_URL || !SPLUNK_HEC_TOKEN) {
  console.error(
    "ORY_WEBHOOK_SECRET, SPLUNK_HEC_URL, and SPLUNK_HEC_TOKEN must be set in .env",
  );
  process.exit(1);
}

interface OryWebhookBody {
  identity?: {
    id?: string;
    traits?: { email?: string };
    metadata_public?: Record<string, unknown>;
  };
  flow?: {
    id?: string;
    type?: string;
  };
  request_headers?: Record<string, string[]>;
}

interface CimAuthEvent {
  action: "success" | "failure";
  app: string;
  src: string;
  dest: string;
  user: string;
  src_user: string;
  authentication_method: string;
  signature: string;
  signature_id: string;
  vendor_product: string;
}

interface HecEvent {
  time: number;
  host: string;
  source: string;
  sourcetype: string;
  index: string;
  event: CimAuthEvent;
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

function extractClientIp(headers: Record<string, string[]> | undefined): string {
  const xff = headers?.["x-forwarded-for"]?.[0];
  return xff ? (xff.split(",")[0]?.trim() ?? "unknown") : "unknown";
}

function authMethod(flow: OryWebhookBody["flow"]): string {
  switch (flow?.type) {
    case "oidc":
      return "oidc";
    case "totp":
      return "totp";
    case "webauthn":
      return "webauthn";
    case "lookup_secret":
      return "lookup_secret";
    default:
      return "password";
  }
}

function buildCimEvent(payload: OryWebhookBody, signature: string): HecEvent {
  return {
    time: Math.floor(Date.now() / 1000),
    host: SPLUNK_HOST,
    source: SPLUNK_SOURCE,
    sourcetype: SPLUNK_SOURCETYPE,
    index: SPLUNK_INDEX,
    event: {
      action: "success",
      app: "ory_network",
      src: extractClientIp(payload?.request_headers),
      dest: SPLUNK_HOST,
      user: payload?.identity?.traits?.email ?? "unknown",
      src_user: payload?.identity?.id ?? "unknown",
      authentication_method: authMethod(payload?.flow),
      signature,
      signature_id: payload?.flow?.id ?? "",
      vendor_product: "Ory Network",
    },
  };
}

async function sendToHec(event: HecEvent): Promise<void> {
  try {
    const res = await fetch(`${SPLUNK_HEC_URL}/services/collector/event`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Splunk ${SPLUNK_HEC_TOKEN}`,
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`Splunk HEC ${res.status}: ${detail}`);
    }
  } catch (err) {
    // Fire-and-forget: a HEC outage shouldn't propagate to Ory.
    console.warn(`Splunk HEC request failed: ${(err as Error).message}`);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

function asyncHook(signature: string) {
  return async (
    req: Request<unknown, unknown, OryWebhookBody>,
    res: Response,
  ) => {
    res.status(200).json({});
    const event = buildCimEvent(req.body, signature);
    await sendToHec(event);
    console.log(`Splunk: sent ${signature} for ${req.body?.identity?.id}`);
  };
}

app.post("/splunk/registration", verifyWebhookSecret, asyncHook("registration.success"));
app.post("/splunk/login", verifyWebhookSecret, asyncHook("login.success"));
app.post("/splunk/recovery", verifyWebhookSecret, asyncHook("recovery.initiated"));
app.post("/splunk/settings", verifyWebhookSecret, asyncHook("settings.updated"));

app.listen(PORT, () => {
  console.log(`Splunk webhook listening on port ${PORT}`);
});
