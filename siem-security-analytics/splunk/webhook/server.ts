// SPDX-License-Identifier: Apache-2.0
//
// Splunk <> Ory Actions webhook handler.
//
// Forwards Ory identity-flow events to Splunk's HTTP Event Collector (HEC).
// The four actions (registration, login, recovery, settings) set
// response.ignore: true, so Ory doesn't wait for this handler and Splunk
// availability never blocks user flows. Events are shaped to the Splunk CIM
// Authentication data model so search and dashboarding work without
// per-event extraction.

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
  };
  flow?: {
    id?: string;
    type?: string;
  };
  authentication_methods?: string[];
  client_ip?: string | null;
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

// Ory sends the session's authentication methods only for login and settings
// actions; registration and recovery events report "unknown".
function authMethod(methods: string[] | undefined): string {
  return methods && methods.length > 0 ? methods.join("+") : "unknown";
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
      src: payload?.client_ip || "unknown",
      dest: SPLUNK_HOST,
      user: payload?.identity?.traits?.email ?? "unknown",
      src_user: payload?.identity?.id ?? "unknown",
      authentication_method: authMethod(payload?.authentication_methods),
      signature,
      signature_id: payload?.flow?.id ?? "",
      vendor_product: "Ory Network",
    },
  };
}

async function sendToHec(event: HecEvent): Promise<void> {
  const res = await fetch(`${SPLUNK_HEC_URL}/services/collector/event`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Splunk ${SPLUNK_HEC_TOKEN}`,
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Splunk HEC ${res.status}: ${await res.text()}`);
  const result = (await res.json()) as { code?: number };
  if (result.code !== 0)
    throw new Error(`Splunk HEC rejected event: code ${result.code}`);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

function asyncHook(signature: string) {
  return async (
    req: Request<unknown, unknown, OryWebhookBody>,
    res: Response,
  ) => {
    try {
      await sendToHec(buildCimEvent(req.body, signature));
      console.log(`Splunk: sent ${signature} for ${req.body?.identity?.id}`);
      res.status(200).json({});
    } catch (error) {
      console.warn(`Splunk HEC request failed: ${(error as Error).message}`);
      res.status(502).json({ error: "delivery_failed" });
    }
  };
}

app.post(
  "/splunk/registration",
  verifyWebhookSecret,
  asyncHook("registration.success"),
);
app.post("/splunk/login", verifyWebhookSecret, asyncHook("login.success"));
app.post(
  "/splunk/recovery",
  verifyWebhookSecret,
  asyncHook("recovery.success"),
);
app.post(
  "/splunk/settings",
  verifyWebhookSecret,
  asyncHook("settings.updated"),
);

app.listen(PORT, () => {
  console.log(`Splunk webhook listening on port ${PORT}`);
});
