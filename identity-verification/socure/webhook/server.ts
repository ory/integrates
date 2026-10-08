// SPDX-License-Identifier: Apache-2.0
//
// Reference webhook handler for the Ory <> Socure integration.
// Two endpoints:
//   POST /socure/verify-identity      — synchronous Ory Action call → Socure ID+
//   POST /socure/results-callback     — async callback FROM Socure with final decision
//                                       (HMAC-SHA256 signature over the raw body)
//
// The sync call runs before Ory saves the identity, so the handler sends its own
// reference to Socure as customerUserId and returns it as the identity's
// external_id. When ORY_SDK_URL and ORY_ADMIN_API_KEY are set, the async
// callback finds the identity by that external_id and writes the final decision
// to metadata_public via the Admin API.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const SOCURE_API_BASE = process.env.SOCURE_API_BASE || "https://api.socure.com";
const SOCURE_API_KEY = process.env.SOCURE_API_KEY;
const SOCURE_MODULES = (process.env.SOCURE_MODULES || "kyc,fraud")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const SOCURE_FRAUD_THRESHOLD = parseFloat(process.env.SOCURE_FRAUD_THRESHOLD || "0.9");
const SOCURE_CALLBACK_SECRET = process.env.SOCURE_CALLBACK_SECRET;
const ORY_SDK_URL = process.env.ORY_SDK_URL;
const ORY_ADMIN_API_KEY = process.env.ORY_ADMIN_API_KEY;

if (!ORY_WEBHOOK_SECRET || !SOCURE_API_KEY) {
  console.error("ORY_WEBHOOK_SECRET and SOCURE_API_KEY must be set in .env");
  process.exit(1);
}

interface OrySocureRequest {
  email?: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  ssn?: string;
  address?: {
    street1?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  device_session_id?: string;
}

interface SocureIdPlusResponse {
  referenceId?: string;
  decision?: { value?: string };
  kyc?: { fieldValidations?: Record<string, unknown> };
  fraud?: { scores?: Array<{ score?: number }> };
}

interface SocureCallbackBody {
  referenceId?: string;
  customerUserId?: string;
  decision?: unknown;
  [key: string]: unknown;
}

// Capture the raw body for HMAC verification on Socure callbacks.
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

// Ory Kratos Identities rejects the flow and shows `text` to the user only for
// a 4xx response in this shape.
function rejectFlow(res: Response, id: number, text: string) {
  res.status(400).json({
    messages: [{ instance_ptr: "#/", messages: [{ id, text, type: "error" }] }],
  });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/socure/verify-identity",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OrySocureRequest>, res: Response) => {
    const {
      email,
      first_name,
      last_name,
      date_of_birth,
      ssn,
      address,
      device_session_id,
    } = req.body;

    if (!email || !first_name || !last_name) {
      rejectFlow(res, 9000301, "Please provide your first name, last name, and email address.");
      return;
    }

    const reference = crypto.randomUUID();

    try {
      const socureRes = await fetch(`${SOCURE_API_BASE}/api/3.0/EmailAuthScore`, {
        method: "POST",
        headers: {
          // Socure's header name is camelCase per its API spec, not a typo.
          SocureApiKey: SOCURE_API_KEY as string,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          modules: SOCURE_MODULES,
          firstName: first_name,
          surName: last_name,
          email,
          dob: date_of_birth,
          nationalId: ssn,
          physicalAddress: address?.street1,
          city: address?.city,
          state: address?.state,
          zip: address?.zip,
          country: address?.country ?? "US",
          deviceSessionId: device_session_id,
          customerUserId: reference,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!socureRes.ok) {
        console.error(`Socure ${socureRes.status}: ${await socureRes.text()}`);
        res.status(502).json({ error: "socure_error" });
        return;
      }

      const result = (await socureRes.json()) as SocureIdPlusResponse;
      const decision = result.decision?.value?.toLowerCase() ?? null;
      const fraudScore = result.fraud?.scores?.[0]?.score ?? null;
      if (decision === "reject" || (fraudScore !== null && fraudScore >= SOCURE_FRAUD_THRESHOLD)) {
        console.log(
          `Socure rejected registration: ref=${result.referenceId} decision=${decision} fraud_score=${fraudScore}`,
        );
        rejectFlow(res, 9000302, "We couldn't verify your identity.");
        return;
      }

      res.json({
        identity: {
          external_id: reference,
          metadata_public: { socure_verification_status: decision ?? "pending" },
          metadata_admin: {
            socure_reference_id: result.referenceId ?? null,
            socure_fraud_score: fraudScore,
          },
        },
      });
    } catch (err) {
      console.error("Verify error:", (err as Error).message);
      res.status(502).json({ error: "verify_failed" });
    }
  },
);

class IdentityNotFoundError extends Error {}

async function writeIdentityMetadata(reference: string, decision: unknown): Promise<void> {
  const lookup = await fetch(
    `${ORY_SDK_URL}/admin/identities/by/external/${encodeURIComponent(reference)}`,
    {
      headers: { authorization: `Bearer ${ORY_ADMIN_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    },
  );
  if (lookup.status === 404) {
    throw new IdentityNotFoundError(`no identity with external_id ${reference}`);
  }
  if (!lookup.ok) {
    const detail = await lookup.text().catch(() => "");
    throw new Error(`Ory lookup ${lookup.status}: ${detail}`);
  }
  const { id: identityId } = (await lookup.json()) as { id: string };
  const res = await fetch(`${ORY_SDK_URL}/admin/identities/${identityId}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${ORY_ADMIN_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify([
      { op: "add", path: "/metadata_public/socure_decision", value: decision },
    ]),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ory patch ${res.status}: ${detail}`);
  }
}

// Async result callback from Socure. HMAC-SHA256 of the raw body using the
// shared secret, delivered in the X-Socure-Signature header (configure this
// in the Socure admin).
app.post(
  "/socure/results-callback",
  async (req: Request<unknown, unknown, SocureCallbackBody>, res: Response) => {
    if (!SOCURE_CALLBACK_SECRET || !ORY_SDK_URL || !ORY_ADMIN_API_KEY) {
      res.status(503).json({ error: "callback_disabled" });
      return;
    }
    const rawBody = req.rawBody;
    if (!rawBody) {
      res.status(400).json({ error: "missing body" });
      return;
    }
    const sig = req.header("x-socure-signature") ?? "";
    const expected = crypto.createHmac("sha256", SOCURE_CALLBACK_SECRET).update(rawBody).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({ error: "invalid signature" });
      return;
    }

    const reference = req.body.customerUserId;
    const decision = req.body.decision;

    console.log(`Socure async result: ref=${req.body.referenceId} customerUserId=${reference}`);

    if (!reference) {
      res.json({ ok: true, ignored: true });
      return;
    }

    // The callback is acknowledged only after the identity is updated, so
    // Socure retries a delivery that failed to apply.
    try {
      await writeIdentityMetadata(reference, decision);
      res.json({ ok: true });
    } catch (err) {
      console.error(`Socure callback write-back failed: ${(err as Error).message}`);
      if (err instanceof IdentityNotFoundError) {
        res.json({ ok: true, ignored: true });
        return;
      }
      res.status(500).json({ error: "processing_failed" });
    }
  },
);

app.listen(PORT, () => {
  console.log(`Socure integration listening on port ${PORT}`);
});
