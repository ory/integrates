// SPDX-License-Identifier: Apache-2.0
//
// Jumio <> Ory Actions webhook handler.
//
// Three endpoints:
//   POST /jumio/initiate  — sync post-registration; starts a Jumio workflow
//                            and writes the Jumio account ID to metadata_public.
//   POST /jumio/callback  — async callback FROM Jumio when the workflow
//                            finishes; HMAC-SHA256 signature verified.
//                            Resolves the Kratos identity via Jumio's
//                            customerInternalReference (we set this to the
//                            Kratos identity id during initiate) and patches
//                            the verification verdict onto the identity.
//   POST /jumio/validate  — sync post-login; blocks login when the stored
//                            verification status is `rejected`.

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
  const basic = Buffer.from(`${JUMIO_CLIENT_ID}:${JUMIO_CLIENT_SECRET}`).toString("base64");
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
app.post(
  "/jumio/initiate",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, InitiateRequest>, res: Response) => {
    const { kratos_identity_id, email } = req.body;
    if (!kratos_identity_id || !email) {
      res.status(400).json({ error: "kratos_identity_id and email are required" });
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

      await kratos.patchIdentity({
        id: kratos_identity_id,
        jsonPatch: [
          { op: JsonPatchOpEnum.Replace, path: "/metadata_public/jumio_account_id", value: accountId },
          {
            op: JsonPatchOpEnum.Replace,
            path: "/metadata_public/jumio_verification_status",
            value: "initiated",
          },
          {
            op: JsonPatchOpEnum.Replace,
            path: "/metadata_public/jumio_initiated_at",
            value: new Date().toISOString(),
          },
          {
            op: JsonPatchOpEnum.Replace,
            path: "/metadata_admin/jumio_transaction_token",
            value: transactionToken,
          },
        ],
      });

      res.json({ success: true, jumio_account_id: accountId });
    } catch (err) {
      console.error("Jumio initiate error:", (err as Error).message);
      // Best-effort: record the error on the identity so support can see it.
      try {
        await kratos.patchIdentity({
          id: kratos_identity_id,
          jsonPatch: [
            {
              op: JsonPatchOpEnum.Replace,
              path: "/metadata_admin/jumio_initiation_error",
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

    // Acknowledge immediately so Jumio doesn't retry while we work.
    res.json({ received: true });

    if (workflowStatus !== "PROCESSED" || !workflowId || !accountId || !kratosIdentityId) {
      console.log(
        `Jumio callback skipped: workflow=${workflowId} status=${workflowStatus} kratos=${kratosIdentityId}`,
      );
      return;
    }

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
      const verified = decisionType === "PASSED";

      await kratos.patchIdentity({
        id: kratosIdentityId,
        jsonPatch: [
          {
            op: JsonPatchOpEnum.Replace,
            path: "/metadata_public/jumio_verification_status",
            value: verified ? "verified" : "rejected",
          },
          {
            op: JsonPatchOpEnum.Replace,
            path: "/metadata_public/jumio_verification_decision",
            value: decisionType,
          },
          {
            op: JsonPatchOpEnum.Replace,
            path: "/metadata_public/jumio_verified_at",
            value: req.body.callbackSentAt ?? new Date().toISOString(),
          },
          {
            op: JsonPatchOpEnum.Replace,
            path: "/metadata_admin/jumio_workflow_id",
            value: workflowId,
          },
        ],
      });

      console.log(
        `Jumio callback: kratos=${kratosIdentityId} decision=${decisionType} verified=${verified}`,
      );
    } catch (err) {
      console.error("Jumio callback processing failed:", (err as Error).message);
    }
  },
);

// Post-login: block when verification is rejected; allow + warn when pending.
app.post(
  "/jumio/validate",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, ValidateRequest>, res: Response) => {
    const { kratos_identity_id, jumio_account_id, jumio_verification_status } = req.body;
    if (!kratos_identity_id || !jumio_account_id) {
      res.json({ success: true }); // no verification on file → allow
      return;
    }

    if (jumio_verification_status === "verified") {
      try {
        await kratos.patchIdentity({
          id: kratos_identity_id,
          jsonPatch: [
            {
              op: JsonPatchOpEnum.Replace,
              path: "/metadata_public/jumio_last_validated_at",
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

    if (jumio_verification_status === "rejected") {
      res.status(400).json({
        messages: [
          {
            instance_ptr: "#/",
            message: "Identity verification failed. Please contact support.",
            type: "error",
          },
        ],
      });
      return;
    }

    // Pending — allow with a warning that the client can render.
    res.json({ success: true, warning: "Please complete identity verification" });
  },
);

app.listen(PORT, () => {
  console.log(`Jumio integration listening on port ${PORT}`);
});
