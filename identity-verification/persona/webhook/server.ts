// SPDX-License-Identifier: Apache-2.0
//
// Persona <> Ory Actions webhook handler.
//
// Three endpoints:
//   POST /persona/initiate  — sync post-registration. Creates a Persona
//                              Inquiry with reference-id = Kratos identity
//                              id, returns the hosted verification URL
//                              and inquiry id, writes IDs to metadata_admin.
//   POST /persona/callback  — async webhook FROM Persona. HMAC-SHA256 of
//                              the raw body via X-Persona-Signature.
//                              Resolves the Kratos identity via the
//                              inquiry's reference-id.
//   POST /persona/validate  — sync post-login. Blocks login when stored
//                              status is "declined".

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { Configuration, IdentityApi, JsonPatchOpEnum } from "@ory/client";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const KRATOS_ADMIN_URL = process.env.KRATOS_ADMIN_URL;
const ORY_API_KEY = process.env.ORY_API_KEY;
const PERSONA_API_KEY = process.env.PERSONA_API_KEY;
const PERSONA_TEMPLATE_ID = process.env.PERSONA_TEMPLATE_ID;
const PERSONA_INQUIRY_TYPE = process.env.PERSONA_INQUIRY_TYPE ?? "hosted-embedded";
const PERSONA_WEBHOOK_SECRET = process.env.PERSONA_WEBHOOK_SECRET;
const PERSONA_API_BASE = process.env.PERSONA_API_BASE ?? "https://api.withpersona.com/api/v1";

if (
  !ORY_WEBHOOK_SECRET ||
  !KRATOS_ADMIN_URL ||
  !ORY_API_KEY ||
  !PERSONA_API_KEY ||
  !PERSONA_TEMPLATE_ID
) {
  console.error(
    "Missing required env vars. See .env.example. Required: ORY_WEBHOOK_SECRET, KRATOS_ADMIN_URL, ORY_API_KEY, PERSONA_API_KEY, PERSONA_TEMPLATE_ID.",
  );
  process.exit(1);
}

const kratos = new IdentityApi(
  new Configuration({ basePath: KRATOS_ADMIN_URL, accessToken: ORY_API_KEY }),
);

interface InitiateRequest {
  kratos_identity_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

interface ValidateRequest {
  kratos_identity_id?: string;
  persona_inquiry_id?: string;
  persona_verification_status?: string;
}

interface PersonaInquiry {
  id: string;
  attributes?: {
    status?: string;
    "reference-id"?: string;
    "inquiry-links"?: { "hosted-url"?: string };
  };
  relationships?: {
    verifications?: {
      data?: Array<{
        type?: string;
        attributes?: { status?: string; result?: unknown };
      }>;
    };
  };
}

interface PersonaCallbackBody {
  "event-type"?: string;
  data?: PersonaInquiry;
}

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

const PERSONA_AUTH = `Bearer ${PERSONA_API_KEY}`;

async function personaFetch<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { authorization: PERSONA_AUTH, "content-type": "application/json" },
    signal: AbortSignal.timeout(15000),
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${PERSONA_API_BASE}${path}`, init);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Persona ${method} ${path} ${res.status}: ${detail}`);
  }
  return (await res.json()) as T;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/persona/initiate",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, InitiateRequest>, res: Response) => {
    const { kratos_identity_id, email } = req.body;
    if (!kratos_identity_id || !email) {
      res.status(400).json({ error: "kratos_identity_id and email are required" });
      return;
    }

    try {
      const inquiryRes = await personaFetch<{ data: PersonaInquiry }>("POST", "/inquiries", {
        data: {
          type: "inquiry",
          attributes: {
            "inquiry-template-id": PERSONA_TEMPLATE_ID,
            "inquiry-type": PERSONA_INQUIRY_TYPE,
            email,
            "reference-id": kratos_identity_id,
          },
        },
      });
      const inquiry = inquiryRes.data;

      await kratos.patchIdentity({
        id: kratos_identity_id,
        jsonPatch: [
          { op: JsonPatchOpEnum.Replace, path: "/metadata_admin/persona_verification_status", value: inquiry.attributes?.status ?? "initiated" },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_admin/persona_inquiry_id", value: inquiry.id },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_admin/persona_initiated_at", value: new Date().toISOString() },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_admin/persona_inquiry_template", value: PERSONA_TEMPLATE_ID },
        ],
      });

      res.json({
        success: true,
        inquiry_id: inquiry.id,
        status: inquiry.attributes?.status,
        verification_url: inquiry.attributes?.["inquiry-links"]?.["hosted-url"] ?? "",
      });
    } catch (err) {
      console.error("Persona initiate error:", (err as Error).message);
      try {
        await kratos.patchIdentity({
          id: kratos_identity_id,
          jsonPatch: [
            {
              op: JsonPatchOpEnum.Replace,
              path: "/metadata_admin/persona_initiation_error",
              value: (err as Error).message,
            },
          ],
        });
      } catch (e) {
        console.error("Failed to record initiation error:", (e as Error).message);
      }
      res.status(200).json({ success: false, error: (err as Error).message });
    }
  },
);

// Async callback FROM Persona. HMAC-SHA256 of the RAW body via X-Persona-Signature.
app.post(
  "/persona/callback",
  async (req: Request<unknown, unknown, PersonaCallbackBody>, res: Response) => {
    if (!PERSONA_WEBHOOK_SECRET) {
      res.status(503).json({ error: "callback_disabled" });
      return;
    }
    const rawBody = req.rawBody;
    if (!rawBody) {
      res.status(400).json({ error: "missing body" });
      return;
    }
    const sig = req.header("x-persona-signature") ?? "";
    const expected = crypto
      .createHmac("sha256", PERSONA_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({ error: "invalid signature" });
      return;
    }

    res.json({ received: true });

    if (req.body["event-type"] !== "inquiry.completed") return;

    const inquiryId = req.body.data?.id;
    const referenceId = req.body.data?.attributes?.["reference-id"];
    if (!inquiryId || !referenceId) {
      console.error("Persona callback missing inquiry id or reference-id");
      return;
    }

    try {
      const detailRes = await personaFetch<{ data: PersonaInquiry }>("GET", `/inquiries/${inquiryId}`);
      const status = detailRes.data.attributes?.status ?? "unknown";

      const verifications = detailRes.data.relationships?.verifications?.data ?? [];
      const verificationResults: Record<string, { status?: string; result?: unknown }> = {};
      for (const v of verifications) {
        if (v.type) {
          verificationResults[v.type] = { status: v.attributes?.status, result: v.attributes?.result };
        }
      }

      await kratos.patchIdentity({
        id: referenceId,
        jsonPatch: [
          { op: JsonPatchOpEnum.Replace, path: "/metadata_admin/persona_verification_status", value: status },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_admin/persona_inquiry_status", value: status },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_admin/persona_completed_at", value: new Date().toISOString() },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_admin/persona_verifications", value: JSON.stringify(verificationResults) },
        ],
      });
      console.log(`Persona callback: identity=${referenceId} status=${status}`);
    } catch (err) {
      console.error("Persona callback processing failed:", (err as Error).message);
    }
  },
);

app.post(
  "/persona/validate",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, ValidateRequest>, res: Response) => {
    const { kratos_identity_id, persona_inquiry_id, persona_verification_status } = req.body;
    if (!kratos_identity_id || !persona_inquiry_id || !persona_verification_status) {
      res.json({ success: true });
      return;
    }
    if (persona_verification_status === "approved") {
      try {
        await kratos.patchIdentity({
          id: kratos_identity_id,
          jsonPatch: [
            {
              op: JsonPatchOpEnum.Replace,
              path: "/metadata_admin/persona_last_validated_at",
              value: new Date().toISOString(),
            },
          ],
        });
      } catch (err) {
        console.warn("Could not update last_validated_at:", (err as Error).message);
      }
      res.json({ success: true });
      return;
    }
    if (persona_verification_status === "declined") {
      res.status(400).json({
        messages: [
          {
            instance_ptr: "#/",
            message: "Identity verification failed. Please contact support.",
            type: "error",
            context: { reason: "identity_verification_declined" },
          },
        ],
      });
      return;
    }
    // "needs_review" / unknown — allow with a warning.
    res.json({ success: true, warning: "Identity verification under review" });
  },
);

app.listen(PORT, () => {
  console.log(`Persona integration listening on port ${PORT}`);
});
