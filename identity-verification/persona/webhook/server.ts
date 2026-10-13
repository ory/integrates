// SPDX-License-Identifier: Apache-2.0
//
// Persona <> Ory Actions webhook handler.
//
// Three endpoints:
//   POST /persona/initiate  — called by your backend after sign-up, or by a
//                              registration.after Ory Action without
//                              response.parse. Creates a Persona Inquiry with
//                              reference-id = Ory identity ID, stores the
//                              inquiry ID on the identity, and returns the
//                              hosted verification URL.
//   POST /persona/callback  — async webhook FROM Persona, verified with the
//                              Persona-Signature header. Resolves the identity
//                              via the inquiry's reference-id.
//   POST /persona/validate  — sync post-login Ory Action. Blocks login when
//                              the stored status is "declined".

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  Configuration,
  IdentityApi,
  type JsonPatch,
  JsonPatchOpEnum,
} from "@ory/client";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const KRATOS_ADMIN_URL = process.env.KRATOS_ADMIN_URL;
const ORY_API_KEY = process.env.ORY_API_KEY;
const PERSONA_API_KEY = process.env.PERSONA_API_KEY;
const PERSONA_TEMPLATE_ID = process.env.PERSONA_TEMPLATE_ID;
const PERSONA_HOSTED_URL =
  process.env.PERSONA_HOSTED_URL ?? "https://inquiry.withpersona.com/verify";
const PERSONA_WEBHOOK_SECRET = process.env.PERSONA_WEBHOOK_SECRET;
const PERSONA_API_BASE =
  process.env.PERSONA_API_BASE ?? "https://api.withpersona.com/api/v1";

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

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// Patch only this integration's keys. When a metadata parent is null, the
// updated_at test prevents replacing data written since the GET; a stale
// snapshot is fetched again before retrying.
async function mergeMetadata(
  id: string,
  update: {
    metadata_public?: Record<string, unknown>;
    metadata_admin?: Record<string, unknown>;
  },
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: identity } = await kratos.getIdentity({ id });
    const jsonPatch: JsonPatch[] = [];
    for (const field of ["metadata_public", "metadata_admin"] as const) {
      const values = update[field];
      if (!values) continue;
      const entries = Object.entries(values).filter(
        ([, value]) => value !== undefined,
      );
      if (entries.length === 0) continue;
      if (identity[field] == null) {
        if (!identity.updated_at)
          throw new Error("Identity is missing updated_at");
        jsonPatch.push({
          op: JsonPatchOpEnum.Test,
          path: "/updated_at",
          value: identity.updated_at,
        });
        jsonPatch.push({
          op: JsonPatchOpEnum.Add,
          path: `/${field}`,
          value: Object.fromEntries(entries),
        });
      } else {
        for (const [key, value] of entries) {
          const escaped = key.replace(/~/g, "~0").replace(/\//g, "~1");
          jsonPatch.push({
            op: JsonPatchOpEnum.Add,
            path: `/${field}/${escaped}`,
            value,
          });
        }
      }
    }
    if (jsonPatch.length === 0) return;
    try {
      await kratos.patchIdentity({ id, jsonPatch });
      return;
    } catch (error) {
      const response = (
        error as { response?: { status?: number; data?: { reason?: string } } }
      ).response;
      if (
        attempt === 2 ||
        response?.status !== 400 ||
        response.data?.reason !== "failed to apply JSON patch"
      )
        throw error;
    }
  }
}

// Ory Kratos Identities shows `text` to the user only for this response shape.
function block(res: Response, text: string): void {
  res.status(403).json({
    messages: [
      { instance_ptr: "#/", messages: [{ id: 9001001, text, type: "error" }] },
    ],
  });
}

// Persona-Signature is `t=<timestamp>,v1=<hex>`, with several space-separated
// pairs while a secret rotates. Each v1 is an HMAC-SHA256 of "<t>.<raw body>".
// Signatures older than five minutes are rejected to limit replays.
function verifyPersonaSignature(
  header: string,
  rawBody: Buffer,
  secret: string,
): boolean {
  for (const pair of header.split(" ")) {
    const parts = Object.fromEntries(
      pair.split(",").map((kv) => {
        const i = kv.indexOf("=");
        return [kv.slice(0, i), kv.slice(i + 1)];
      }),
    );
    if (!parts.t || !parts.v1) continue;
    if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) continue;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${parts.t}.`)
      .update(rawBody)
      .digest("hex");
    const a = Buffer.from(parts.v1);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

interface InitiateRequest {
  kratos_identity_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

interface ValidateRequest {
  persona_verification_status?: string;
}

interface PersonaInquiry {
  id: string;
  type?: string;
  attributes?: {
    status?: string;
    "reference-id"?: string;
  };
}

interface PersonaIncluded {
  id: string;
  type?: string;
  attributes?: { status?: string };
}

// Persona wraps every webhook in an event resource. The inquiry snapshot sits
// in data.attributes.payload.data.
interface PersonaEventBody {
  data?: {
    type?: string;
    attributes?: {
      name?: string;
      payload?: { data?: PersonaInquiry };
    };
  };
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

async function personaFetch<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: {
      authorization: PERSONA_AUTH,
      "content-type": "application/json",
    },
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
    const { kratos_identity_id, email, first_name, last_name } = req.body;
    if (!kratos_identity_id || kratos_identity_id === NIL_UUID || !email) {
      res
        .status(400)
        .json({ error: "a saved kratos_identity_id and email are required" });
      return;
    }

    try {
      const inquiryRes = await personaFetch<{ data: PersonaInquiry }>(
        "POST",
        "/inquiries",
        {
          data: {
            type: "inquiry",
            attributes: {
              "inquiry-template-id": PERSONA_TEMPLATE_ID,
              fields: {
                "email-address": email,
                ...(first_name && { "name-first": first_name }),
                ...(last_name && { "name-last": last_name }),
              },
              "reference-id": kratos_identity_id,
            },
          },
        },
      );
      const inquiry = inquiryRes.data;

      await mergeMetadata(kratos_identity_id, {
        metadata_public: {
          persona_verification_status: inquiry.attributes?.status ?? "created",
          persona_inquiry_id: inquiry.id,
          persona_initiated_at: new Date().toISOString(),
        },
        metadata_admin: { persona_inquiry_template: PERSONA_TEMPLATE_ID },
      });

      const verificationUrl = new URL(PERSONA_HOSTED_URL);
      verificationUrl.searchParams.set("inquiry-id", inquiry.id);
      res.json({
        inquiry_id: inquiry.id,
        status: inquiry.attributes?.status,
        verification_url: verificationUrl.toString(),
      });
    } catch (err) {
      console.error("Persona initiate error:", (err as Error).message);
      res.status(502).json({ error: "persona_initiate_failed" });
    }
  },
);

// Async callback FROM Persona. Subscribe it to the inquiry events your
// template emits, such as inquiry.completed, inquiry.approved, and
// inquiry.declined. The handler answers 2xx only after the identity is
// updated, so Persona retries a delivery that failed to apply.
app.post(
  "/persona/callback",
  async (req: Request<unknown, unknown, PersonaEventBody>, res: Response) => {
    if (!PERSONA_WEBHOOK_SECRET) {
      res.status(503).json({ error: "callback_disabled" });
      return;
    }
    const rawBody = req.rawBody;
    if (!rawBody) {
      res.status(400).json({ error: "missing body" });
      return;
    }
    if (
      !verifyPersonaSignature(
        req.header("persona-signature") ?? "",
        rawBody,
        PERSONA_WEBHOOK_SECRET,
      )
    ) {
      res.status(401).json({ error: "invalid signature" });
      return;
    }

    const eventName = req.body.data?.attributes?.name ?? "";
    const snapshot = req.body.data?.attributes?.payload?.data;
    if (!eventName.startsWith("inquiry.") || snapshot?.type !== "inquiry") {
      res.json({ received: true, ignored: true });
      return;
    }

    const inquiryId = snapshot.id;
    const referenceId = snapshot.attributes?.["reference-id"];
    if (!inquiryId || !referenceId || referenceId === NIL_UUID) {
      console.error(`Persona ${eventName}: inquiry has no usable reference-id`);
      res.json({ received: true, ignored: true });
      return;
    }

    try {
      // Event deliveries can arrive out of order, so the current inquiry state
      // is fetched instead of trusting the snapshot in the event.
      const detail = await personaFetch<{
        data: PersonaInquiry;
        included?: PersonaIncluded[];
      }>("GET", `/inquiries/${encodeURIComponent(inquiryId)}`);
      const status = detail.data.attributes?.status ?? "unknown";

      const verificationResults: Record<string, string | undefined> = {};
      for (const item of detail.included ?? []) {
        if (item.type?.startsWith("verification/")) {
          verificationResults[`${item.type}:${item.id}`] =
            item.attributes?.status;
        }
      }

      await mergeMetadata(referenceId, {
        metadata_public: {
          persona_verification_status: status,
          persona_updated_at: new Date().toISOString(),
        },
        metadata_admin: { persona_verifications: verificationResults },
      });
      console.log(
        `Persona ${eventName}: identity=${referenceId} status=${status}`,
      );
      res.json({ received: true });
    } catch (err) {
      console.error(
        "Persona callback processing failed:",
        (err as Error).message,
      );
      res.status(500).json({ error: "processing_failed" });
    }
  },
);

// Ory Kratos Identities ignores identity changes in a login.after response,
// so this only decides. Other statuses, such as needs_review, are allowed.
app.post(
  "/persona/validate",
  verifyWebhookSecret,
  (req: Request<unknown, unknown, ValidateRequest>, res: Response) => {
    if (req.body.persona_verification_status === "declined") {
      block(res, "Identity verification failed. Please contact support.");
      return;
    }
    res.json({});
  },
);

app.listen(PORT, () => {
  console.log(`Persona integration listening on port ${PORT}`);
});
