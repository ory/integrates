// SPDX-License-Identifier: Apache-2.0
//
// Reference webhook handler for the Ory <> GBG (Acuant) integration.
// Receives an Ory Action webhook on registration, creates a Case on a GBG
// GO Journey, and turns the GBG decision into an Ory response: PASS lets the
// registration through, FAIL rejects it, and REFER follows GBG_REFER_ACTION.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const GBG_API_BASE = process.env.GBG_API_BASE || "https://api.gbgplc.com";
const GBG_API_TOKEN = process.env.GBG_API_TOKEN;
const GBG_JOURNEY_ID = process.env.GBG_JOURNEY_ID;
const GBG_API_PATH = process.env.GBG_API_PATH || "/identity/journey/v1/journeys";
const GBG_REFER_ACTION = process.env.GBG_REFER_ACTION === "allow" ? "allow" : "block";

if (!ORY_WEBHOOK_SECRET || !GBG_API_TOKEN || !GBG_JOURNEY_ID) {
  console.error("ORY_WEBHOOK_SECRET, GBG_API_TOKEN and GBG_JOURNEY_ID must be set in .env");
  process.exit(1);
}

interface OryWebhookBody {
  email?: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  document_image?: string;
  selfie_image?: string;
}

interface GbgCaseResponse {
  id?: string;
  decision?: string;
  outcome?: string;
  reasons?: string[];
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
  "/gbg/verify-identity",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OryWebhookBody>, res: Response) => {
    const { email, first_name, last_name, date_of_birth, document_image, selfie_image } = req.body;

    if (!email || !first_name || !last_name) {
      rejectFlow(res, 9000201, "Please provide your first name, last name, and email address.");
      return;
    }

    // The identity is not saved yet, so the handler creates its own reference
    // and stores it as the identity's external_id.
    const reference = crypto.randomUUID();

    try {
      const gbgRes = await fetch(
        `${GBG_API_BASE}${GBG_API_PATH}/${GBG_JOURNEY_ID}/cases`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${GBG_API_TOKEN}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            externalReference: reference,
            person: {
              name: { given: first_name, family: last_name },
              email,
              dateOfBirth: date_of_birth,
            },
            evidence: {
              ...(document_image && { document: { image: document_image } }),
              ...(selfie_image && { selfie: { image: selfie_image } }),
            },
          }),
          signal: AbortSignal.timeout(15000),
        },
      );

      if (!gbgRes.ok) {
        console.error(`GBG ${gbgRes.status}: ${await gbgRes.text()}`);
        res.status(502).json({ error: "gbg_error" });
        return;
      }

      const result = (await gbgRes.json()) as GbgCaseResponse;
      const decision = (result.decision ?? result.outcome ?? "").toUpperCase();
      const pass = decision === "PASS" || (decision === "REFER" && GBG_REFER_ACTION === "allow");
      if (!pass) {
        console.log(`GBG rejected registration: case=${result.id} decision=${decision || "none"}`);
        rejectFlow(res, 9000202, "We couldn't verify your identity documents.");
        return;
      }

      res.json({
        identity: {
          external_id: reference,
          metadata_public: { gbg_decision: decision },
          metadata_admin: { gbg_case_id: result.id ?? null, gbg_reasons: result.reasons ?? [] },
        },
      });
    } catch (err) {
      console.error("Verify error:", (err as Error).message);
      res.status(502).json({ error: "verify_failed" });
    }
  },
);

app.listen(PORT, () => {
  console.log(`GBG (Acuant) integration listening on port ${PORT}`);
});
