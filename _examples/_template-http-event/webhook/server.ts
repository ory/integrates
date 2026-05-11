// SPDX-License-Identifier: Apache-2.0
//
// Reference handler for an Ory Live Event Stream consumer.
// Authenticates with HTTP Basic Auth, dedupes by sha256(body), dispatches by
// event type. Always returns 200 (Ory discards the response body).

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { remember } from "./idempotency.js";

const PORT = Number(process.env.PORT) || 3000;
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER;
const BASIC_AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD;
const VENDOR_API_BASE = process.env.VENDOR_API_BASE || "https://api.example.com";
const VENDOR_API_TOKEN = process.env.VENDOR_API_TOKEN;

if (!BASIC_AUTH_USER || !BASIC_AUTH_PASSWORD) {
  console.error("BASIC_AUTH_USER and BASIC_AUTH_PASSWORD must be set in .env");
  process.exit(1);
}

// Shape of an Ory Live Event. Tighten attributes per event type once you know
// which fields you actually consume.
interface OryLiveEvent {
  name?: string;
  attributes?: {
    identity_id?: string;
    identity_traits?: {
      email?: string;
      [trait: string]: unknown;
    };
    [attr: string]: unknown;
  };
}

// Capture the raw body for sha256 dedup, then JSON-parse for the handler.
declare module "express-serve-static-core" {
  interface Request {
    rawBody?: Buffer;
  }
}

const app = express();
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as Request).rawBody = buf;
    },
  }),
);

function verifyBasicAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  if (!header.startsWith("Basic ")) {
    res.set("WWW-Authenticate", "Basic");
    res.status(401).json({ error: "missing basic auth" });
    return;
  }
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const [user, pass] = decoded.split(":", 2);

  // Timing-safe compare for both fields. Length-check first so the
  // timingSafeEqual call only runs on equal-length buffers.
  const expectedUser = Buffer.from(BASIC_AUTH_USER as string);
  const expectedPass = Buffer.from(BASIC_AUTH_PASSWORD as string);
  const providedUser = Buffer.from(user ?? "");
  const providedPass = Buffer.from(pass ?? "");

  const userOk =
    providedUser.length === expectedUser.length &&
    crypto.timingSafeEqual(providedUser, expectedUser);
  const passOk =
    providedPass.length === expectedPass.length &&
    crypto.timingSafeEqual(providedPass, expectedPass);

  if (!userOk || !passOk) {
    res.set("WWW-Authenticate", "Basic");
    res.status(401).json({ error: "invalid basic auth" });
    return;
  }
  next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Per-event handlers. Add cases as you subscribe to more event types.
//
// Use the built-in fetch (Node >=18) for vendor calls — no axios/got/node-fetch.
// AbortSignal.timeout caps each call so a slow vendor doesn't pin the worker.
async function handleIdentityCreated(event: OryLiveEvent): Promise<void> {
  const identityId = event.attributes?.identity_id;
  const traits = event.attributes?.identity_traits ?? {};

  const vendorRes = await fetch(`${VENDOR_API_BASE}/v1/contacts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(VENDOR_API_TOKEN && { authorization: `Bearer ${VENDOR_API_TOKEN}` }),
    },
    body: JSON.stringify({ external_id: identityId, email: traits.email }),
    signal: AbortSignal.timeout(5000),
  });

  if (!vendorRes.ok) {
    // Throw so the dispatcher logs and (per its policy) returns 200 to Ory.
    throw new Error(`vendor ${vendorRes.status}: ${await vendorRes.text()}`);
  }
  console.log("IdentityCreated:", identityId);
}

async function handleLoginSucceeded(event: OryLiveEvent): Promise<void> {
  // TODO: implement — see handleIdentityCreated above for the fetch pattern.
  console.log("LoginSucceeded:", event.attributes?.identity_id);
}

const dispatch: Record<string, (event: OryLiveEvent) => Promise<void>> = {
  IdentityCreated: handleIdentityCreated,
  LoginSucceeded: handleLoginSucceeded,
};

app.post(
  "/events",
  verifyBasicAuth,
  async (req: Request<unknown, unknown, OryLiveEvent>, res: Response) => {
    const rawBody = req.rawBody;
    if (!rawBody) {
      res.status(400).json({ error: "missing body" });
      return;
    }
    const dedupKey = crypto.createHash("sha256").update(rawBody).digest("hex");
    if (!remember(dedupKey)) {
      // Already handled within the dedup window; return 200 immediately.
      res.json({ ok: true, deduped: true });
      return;
    }

    const event = req.body;
    const handler = event?.name ? dispatch[event.name] : undefined;

    if (handler) {
      try {
        await handler(event);
      } catch (err) {
        // Live events have at-least-once semantics; logging + 200 lets Ory move on.
        // If you want Ory to retry, return 5xx — but be careful with side-effect ordering.
        console.error(`Handler ${event.name} failed:`, (err as Error).message);
      }
    } else {
      // Unknown event name. Don't retry — most likely the handler hasn't been updated yet.
      console.warn("Unhandled event:", event?.name);
    }

    res.json({ ok: true });
  },
);

app.listen(PORT, () => {
  console.log(`Live event handler listening on port ${PORT}`);
});
