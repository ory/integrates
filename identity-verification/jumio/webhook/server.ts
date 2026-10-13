// SPDX-License-Identifier: Apache-2.0
//
// Jumio <> Ory Actions webhook handler.
//
// Three endpoints:
//   POST /jumio/initiate  — post-registration, after the identity is saved;
//                            starts a Jumio workflow and writes the Jumio
//                            account ID to metadata_public.
//   POST /jumio/callback  — async callback FROM Jumio when the workflow
//                            finishes; HMAC-SHA256 signature verified.
//                            Resolves the Kratos identity via Jumio's
//                            customerInternalReference (we set this to the
//                            Kratos identity id during initiate) and patches
//                            the verification verdict onto the identity.
//   POST /jumio/validate  — sync post-login with response.parse; blocks login
//                            when the stored verification status is `rejected`.

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
const JUMIO_AUTH_URL = process.env.JUMIO_AUTH_URL;
const JUMIO_API_BASE_URL = process.env.JUMIO_API_BASE_URL;
const JUMIO_CLIENT_ID = process.env.JUMIO_CLIENT_ID;
const JUMIO_CLIENT_SECRET = process.env.JUMIO_CLIENT_SECRET;
const JUMIO_WORKFLOW_KEY = Number(process.env.JUMIO_WORKFLOW_KEY ?? "10011");
const JUMIO_CALLBACK_SECRET = process.env.JUMIO_CALLBACK_SECRET;

if (
  !ORY_WEBHOOK_SECRET ||
  !KRATOS_ADMIN_URL ||
  !ORY_API_KEY ||
  !JUMIO_AUTH_URL ||
  !JUMIO_API_BASE_URL ||
  !JUMIO_CLIENT_ID ||
  !JUMIO_CLIENT_SECRET
) {
  console.error(
    "Missing required env vars. See .env.example. Required: ORY_WEBHOOK_SECRET, KRATOS_ADMIN_URL, ORY_API_KEY, JUMIO_AUTH_URL, JUMIO_API_BASE_URL, JUMIO_CLIENT_ID, JUMIO_CLIENT_SECRET.",
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

interface InitiateRequest {
  kratos_identity_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

interface ValidateRequest {
  kratos_identity_id?: string;
  jumio_account_id?: string;
  jumio_verification_status?: string;
}

interface JumioCallbackBody {
  callbackSentAt?: string;
  workflowExecution?: { id?: string; status?: string };
  account?: { id?: string; customerInternalReference?: string };
}

interface JumioTokenResponse {
  access_token: string;
  expires_in?: number;
}

interface JumioAccountCreateResponse {
  id: string;
  token: string;
}

interface JumioWorkflowResponse {
  decision?: { type?: "PASSED" | "REJECTED" | "WARNING" | "NOT_EXECUTED" };
}

// Capture raw body for Jumio HMAC verification.
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

let cachedJumioToken: { token: string; expiresAt: number } | null = null;

async function getJumioToken(): Promise<string> {
  if (cachedJumioToken && Date.now() < cachedJumioToken.expiresAt - 60_000) {
    return cachedJumioToken.token;
  }
  const basic = Buffer.from(
    `${JUMIO_CLIENT_ID}:${JUMIO_CLIENT_SECRET}`,
  ).toString("base64");
  const res = await fetch(JUMIO_AUTH_URL as string, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Jumio OAuth ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as JumioTokenResponse;
  cachedJumioToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedJumioToken.token;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Post-registration: create a Jumio account/workflow and record the IDs.
// Configure this action without response.parse so it runs after the identity
// is saved and receives the real identity ID.
app.post(
  "/jumio/initiate",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, InitiateRequest>, res: Response) => {
    const { kratos_identity_id, email } = req.body;
    if (!kratos_identity_id || kratos_identity_id === NIL_UUID || !email) {
      res
        .status(400)
        .json({ error: "a saved kratos_identity_id and email are required" });
      return;
    }

    try {
      const accessToken = await getJumioToken();
      const accountRes = await fetch(`${JUMIO_API_BASE_URL}/accounts`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          customerInternalReference: kratos_identity_id,
          workflowDefinition: { key: JUMIO_WORKFLOW_KEY },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!accountRes.ok) {
        const detail = await accountRes.text().catch(() => "");
        throw new Error(`Jumio account ${accountRes.status}: ${detail}`);
      }
      const { id: accountId, token: transactionToken } =
        (await accountRes.json()) as JumioAccountCreateResponse;

      await mergeMetadata(kratos_identity_id, {
        metadata_public: {
          jumio_account_id: accountId,
          jumio_verification_status: "initiated",
          jumio_initiated_at: new Date().toISOString(),
        },
        metadata_admin: { jumio_transaction_token: transactionToken },
      });

      res.json({ success: true, jumio_account_id: accountId });
    } catch (err) {
      console.error("Jumio initiate error:", (err as Error).message);
      try {
        await mergeMetadata(kratos_identity_id, {
          metadata_admin: { jumio_initiation_error: (err as Error).message },
        });
      } catch (e) {
        console.error(
          "Failed to record initiation error:",
          (e as Error).message,
        );
      }
      res.status(200).json({ success: false, error: (err as Error).message });
    }
  },
);

// Async callback FROM Jumio. HMAC-SHA256 of the raw body using the shared
// secret, delivered in the X-Jumio-Signature header (configure this in Jumio
// admin under workflow callbacks).
app.post(
  "/jumio/callback",
  async (req: Request<unknown, unknown, JumioCallbackBody>, res: Response) => {
    if (!JUMIO_CALLBACK_SECRET) {
      res.status(503).json({ error: "callback_disabled" });
      return;
    }
    const rawBody = req.rawBody;
    if (!rawBody) {
      res.status(400).json({ error: "missing body" });
      return;
    }
    const sig = req.header("x-jumio-signature") ?? "";
    const expected = crypto
      .createHmac("sha256", JUMIO_CALLBACK_SECRET)
      .update(rawBody)
      .digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({ error: "invalid signature" });
      return;
    }

    const workflowId = req.body.workflowExecution?.id;
    const workflowStatus = req.body.workflowExecution?.status;
    const accountId = req.body.account?.id;
    // customerInternalReference is what we set to kratos_identity_id on initiate.
    const kratosIdentityId = req.body.account?.customerInternalReference;

    if (
      workflowStatus !== "PROCESSED" ||
      !workflowId ||
      !accountId ||
      !kratosIdentityId
    ) {
      console.log(
        `Jumio callback skipped: workflow=${workflowId} status=${workflowStatus} kratos=${kratosIdentityId}`,
      );
      res.json({ received: true, ignored: true });
      return;
    }

    // The callback is acknowledged only after the identity is updated, so a
    // failed update is retried by Jumio instead of being lost. If this work can
    // outlast Jumio's callback timeout, put a durable queue in front of it.

    try {
      const accessToken = await getJumioToken();
      const detailsRes = await fetch(
        `${JUMIO_API_BASE_URL}/accounts/${accountId}/workflow-executions/${workflowId}`,
        {
          headers: { authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!detailsRes.ok) {
        const detail = await detailsRes.text().catch(() => "");
        throw new Error(`Jumio details ${detailsRes.status}: ${detail}`);
      }
      const details = (await detailsRes.json()) as JumioWorkflowResponse;
      const decisionType = details.decision?.type ?? "UNKNOWN";
      // Every decision other than PASSED, including WARNING, blocks sign-in.
      // Map WARNING to a review status here to route it to manual review instead.
      const verified = decisionType === "PASSED";

      await mergeMetadata(kratosIdentityId, {
        metadata_public: {
          jumio_verification_status: verified ? "verified" : "rejected",
          jumio_verification_decision: decisionType,
          jumio_verified_at:
            req.body.callbackSentAt ?? new Date().toISOString(),
        },
        metadata_admin: { jumio_workflow_id: workflowId },
      });

      console.log(
        `Jumio callback: kratos=${kratosIdentityId} decision=${decisionType} verified=${verified}`,
      );
      res.json({ received: true });
    } catch (err) {
      console.error(
        "Jumio callback processing failed:",
        (err as Error).message,
      );
      res.status(500).json({ error: "processing_failed" });
    }
  },
);

// Post-login: block when verification is rejected. Ory Kratos Identities
// ignores identity changes in a login.after response, so this only decides.
app.post(
  "/jumio/validate",
  verifyWebhookSecret,
  (req: Request<unknown, unknown, ValidateRequest>, res: Response) => {
    if (req.body.jumio_verification_status === "rejected") {
      block(res, "Identity verification failed. Please contact support.");
      return;
    }
    res.json({});
  },
);

app.listen(PORT, () => {
  console.log(`Jumio integration listening on port ${PORT}`);
});
