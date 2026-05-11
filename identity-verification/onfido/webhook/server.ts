// SPDX-License-Identifier: Apache-2.0
//
// Onfido <> Ory Actions webhook handler.
//
// Three endpoints:
//   POST /onfido/initiate  — sync post-registration. Creates an Onfido
//                             applicant + workflow run, returns the SDK
//                             token to the client, and writes IDs into
//                             metadata_public.
//   POST /onfido/callback  — async webhook FROM Onfido. HMAC-SHA256 of the
//                             raw body via X-SHA2-Signature; resolves the
//                             Kratos identity from custom_data.kratos_identity_id
//                             we set on initiate.
//   POST /onfido/validate  — sync post-login. Blocks login when stored
//                             status is "declined".

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
const ONFIDO_API_TOKEN = process.env.ONFIDO_API_TOKEN;
const ONFIDO_REGION = (process.env.ONFIDO_REGION ?? "EU") as "EU" | "US" | "CA";
const ONFIDO_WORKFLOW_ID = process.env.ONFIDO_WORKFLOW_ID;
const ONFIDO_WEBHOOK_TOKEN = process.env.ONFIDO_WEBHOOK_TOKEN;

if (
  !ORY_WEBHOOK_SECRET ||
  !KRATOS_ADMIN_URL ||
  !ORY_API_KEY ||
  !ONFIDO_API_TOKEN ||
  !ONFIDO_WORKFLOW_ID
) {
  console.error(
    "Missing required env vars. See .env.example. Required: ORY_WEBHOOK_SECRET, KRATOS_ADMIN_URL, ORY_API_KEY, ONFIDO_API_TOKEN, ONFIDO_WORKFLOW_ID.",
  );
  process.exit(1);
}

const ONFIDO_BASE_URLS: Record<"EU" | "US" | "CA", string> = {
  EU: "https://api.eu.onfido.com/v3.6",
  US: "https://api.us.onfido.com/v3.6",
  CA: "https://api.ca.onfido.com/v3.6",
};
const ONFIDO_BASE_URL = ONFIDO_BASE_URLS[ONFIDO_REGION];

const kratos = new IdentityApi(
  new Configuration({ basePath: KRATOS_ADMIN_URL, accessToken: ORY_API_KEY }),
);

interface InitiateRequest {
  kratos_identity_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  date_of_birth?: string;
}

interface ValidateRequest {
  kratos_identity_id?: string;
  onfido_verification_status?: string;
}

interface OnfidoCallbackBody {
  payload?: {
    resource_type?: string;
    action?: string;
    object?: { id?: string; completed_at_iso8601?: string };
  };
}

interface OnfidoApplicant {
  id: string;
}
interface OnfidoWorkflowRun {
  id: string;
  sdk_token?: string;
  dashboard_url?: string;
  status?: string;
  output?: unknown;
  custom_data?: { kratos_identity_id?: string };
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

const ONFIDO_AUTH = `Token token=${ONFIDO_API_TOKEN}`;

async function onfidoFetch<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: {
      authorization: ONFIDO_AUTH,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${ONFIDO_BASE_URL}${path}`, init);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Onfido ${method} ${path} ${res.status}: ${detail}`);
  }
  return (await res.json()) as T;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/onfido/initiate",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, InitiateRequest>, res: Response) => {
    const { kratos_identity_id, first_name, last_name, email, date_of_birth } = req.body;
    if (!kratos_identity_id || !first_name || !last_name) {
      res.status(400).json({ error: "kratos_identity_id, first_name, last_name are required" });
      return;
    }

    try {
      const applicant = await onfidoFetch<OnfidoApplicant>("POST", "/applicants", {
        first_name,
        last_name,
        ...(email && { email }),
        ...(date_of_birth && { dob: date_of_birth }),
      });

      const workflowRun = await onfidoFetch<OnfidoWorkflowRun>("POST", "/workflow_runs", {
        workflow_id: ONFIDO_WORKFLOW_ID,
        applicant_id: applicant.id,
        custom_data: { kratos_identity_id },
      });

      await kratos.patchIdentity({
        id: kratos_identity_id,
        jsonPatch: [
          { op: JsonPatchOpEnum.Replace, path: "/metadata_public/onfido_verification_status", value: "initiated" },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_public/onfido_applicant_id", value: applicant.id },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_public/onfido_workflow_run_id", value: workflowRun.id },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_public/onfido_initiated_at", value: new Date().toISOString() },
          ...(workflowRun.sdk_token
            ? [{ op: JsonPatchOpEnum.Replace, path: "/metadata_admin/onfido_sdk_token", value: workflowRun.sdk_token }]
            : []),
          ...(workflowRun.dashboard_url
            ? [{ op: JsonPatchOpEnum.Replace, path: "/metadata_admin/onfido_dashboard_url", value: workflowRun.dashboard_url }]
            : []),
        ],
      });

      res.json({
        success: true,
        sdk_token: workflowRun.sdk_token,
        workflow_run_id: workflowRun.id,
      });
    } catch (err) {
      console.error("Onfido initiate error:", (err as Error).message);
      try {
        await kratos.patchIdentity({
          id: kratos_identity_id,
          jsonPatch: [
            {
              op: JsonPatchOpEnum.Replace,
              path: "/metadata_admin/onfido_initiation_error",
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

// Async callback FROM Onfido. HMAC-SHA256 over the RAW body (not a
// re-serialized JSON copy) using the configured webhook token.
app.post(
  "/onfido/callback",
  async (req: Request<unknown, unknown, OnfidoCallbackBody>, res: Response) => {
    if (!ONFIDO_WEBHOOK_TOKEN) {
      res.status(503).json({ error: "callback_disabled" });
      return;
    }
    const rawBody = req.rawBody;
    if (!rawBody) {
      res.status(400).json({ error: "missing body" });
      return;
    }
    const sig = req.header("x-sha2-signature") ?? "";
    const expected = crypto
      .createHmac("sha256", ONFIDO_WEBHOOK_TOKEN)
      .update(rawBody)
      .digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({ error: "invalid signature" });
      return;
    }

    const { resource_type, action, object } = req.body.payload ?? {};
    res.json({ received: true });

    if (resource_type !== "workflow_run" || action !== "workflow_run.completed" || !object?.id) {
      return;
    }
    const workflowRunId = object.id;

    try {
      const wr = await onfidoFetch<OnfidoWorkflowRun>("GET", `/workflow_runs/${workflowRunId}`);
      const kratosIdentityId = wr.custom_data?.kratos_identity_id;
      if (!kratosIdentityId) {
        console.error(`Onfido workflow_run ${workflowRunId} missing custom_data.kratos_identity_id`);
        return;
      }
      await kratos.patchIdentity({
        id: kratosIdentityId,
        jsonPatch: [
          { op: JsonPatchOpEnum.Replace, path: "/metadata_public/onfido_verification_status", value: wr.status ?? "unknown" },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_public/onfido_completed_at", value: object.completed_at_iso8601 ?? new Date().toISOString() },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_admin/onfido_output", value: JSON.stringify(wr.output ?? null) },
        ],
      });
      console.log(`Onfido callback: kratos=${kratosIdentityId} status=${wr.status}`);
    } catch (err) {
      console.error("Onfido callback processing failed:", (err as Error).message);
    }
  },
);

app.post(
  "/onfido/validate",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, ValidateRequest>, res: Response) => {
    const { kratos_identity_id, onfido_verification_status } = req.body;
    if (!kratos_identity_id || !onfido_verification_status) {
      res.json({ success: true });
      return;
    }
    if (onfido_verification_status === "approved") {
      try {
        await kratos.patchIdentity({
          id: kratos_identity_id,
          jsonPatch: [
            {
              op: JsonPatchOpEnum.Replace,
              path: "/metadata_public/onfido_last_validated_at",
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
    if (onfido_verification_status === "declined") {
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
    // "review" or unknown — allow with a warning.
    res.json({ success: true, warning: "Identity verification under review" });
  },
);

app.listen(PORT, () => {
  console.log(`Onfido integration listening on port ${PORT}`);
});
