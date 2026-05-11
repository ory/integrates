// SPDX-License-Identifier: Apache-2.0
//
// LexisNexis Risk Solutions <> Ory Actions webhook handler.
//
// Two endpoints:
//   POST /lexisnexis/verify   — sync post-registration. Calls LexisNexis
//                                InstantID, evaluates NAS/NAP/CVI scores,
//                                patches verification result onto the
//                                Kratos identity via the Admin API.
//   POST /lexisnexis/validate — sync post-login. Blocks login when the
//                                stored verification_status is "failed".

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
const LN_USERNAME = process.env.LEXISNEXIS_USERNAME;
const LN_PASSWORD = process.env.LEXISNEXIS_PASSWORD;
const LN_API_URL = process.env.LEXISNEXIS_API_URL;
const LN_ORG_ID = process.env.LEXISNEXIS_ORG_ID;

const NAS_THRESHOLD = Number(process.env.INSTANTID_NAS_THRESHOLD ?? "50");
const NAP_THRESHOLD = Number(process.env.INSTANTID_NAP_THRESHOLD ?? "50");
const CVI_THRESHOLD = Number(process.env.INSTANTID_CVI_THRESHOLD ?? "50");

if (
  !ORY_WEBHOOK_SECRET ||
  !KRATOS_ADMIN_URL ||
  !ORY_API_KEY ||
  !LN_USERNAME ||
  !LN_PASSWORD ||
  !LN_API_URL ||
  !LN_ORG_ID
) {
  console.error(
    "Missing required env vars. See .env.example. Required: ORY_WEBHOOK_SECRET, KRATOS_ADMIN_URL, ORY_API_KEY, LEXISNEXIS_USERNAME, LEXISNEXIS_PASSWORD, LEXISNEXIS_API_URL, LEXISNEXIS_ORG_ID.",
  );
  process.exit(1);
}

const kratos = new IdentityApi(
  new Configuration({ basePath: KRATOS_ADMIN_URL, accessToken: ORY_API_KEY }),
);

const LN_AUTH = `Basic ${Buffer.from(`${LN_USERNAME}:${LN_PASSWORD}`).toString("base64")}`;

interface VerifyRequest {
  kratos_identity_id?: string;
  first_name?: string;
  last_name?: string;
  address?: { street?: string; city?: string; state?: string; postal_code?: string };
  date_of_birth?: string;
  ssn?: string;
  phone_number?: string;
}

interface ValidateRequest {
  kratos_identity_id?: string;
  lexisnexis_verification_status?: string;
  lexisnexis_cvi_score?: number;
}

interface InstantIDResult {
  verificationIndicator: string;
  nameAddressSSNSummary: number;
  nameAddressPhoneSummary: number;
  comprehensiveVerification: number;
}

interface InstantIDApiResponse {
  Response?: { Result?: InstantIDResult };
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

async function callInstantID(req: VerifyRequest): Promise<InstantIDResult> {
  const [year, month, day] = (req.date_of_birth ?? "").split("-");
  const body = {
    OrgId: LN_ORG_ID,
    User: { GLBPurpose: "1", DLPurpose: "1" },
    Options: {
      UseOFACList: "true",
      VerifySSN: req.ssn ? "true" : "false",
    },
    SearchBy: {
      Name: { First: req.first_name, Last: req.last_name },
      Address: {
        StreetAddress1: req.address?.street ?? "",
        City: req.address?.city ?? "",
        State: req.address?.state ?? "",
        Zip5: req.address?.postal_code ?? "",
      },
      DOB: { Year: year, Month: month, Day: day },
      ...(req.ssn && { SSN: req.ssn }),
      ...(req.phone_number && { Phone10: req.phone_number }),
    },
  };

  const res = await fetch(`${LN_API_URL}/instantid`, {
    method: "POST",
    headers: {
      authorization: LN_AUTH,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LexisNexis ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as InstantIDApiResponse;
  const result = data.Response?.Result;
  if (!result) throw new Error("LexisNexis response missing Result");
  return result;
}

function isVerified(r: InstantIDResult): boolean {
  // NAS/NAP are 0–999 scale, normalize to 0–100 for threshold comparison.
  const nas = (r.nameAddressSSNSummary / 999) * 100;
  const nap = (r.nameAddressPhoneSummary / 999) * 100;
  const cvi = r.comprehensiveVerification;
  return (
    r.verificationIndicator === "Pass" &&
    cvi >= CVI_THRESHOLD &&
    (nas >= NAS_THRESHOLD || nap >= NAP_THRESHOLD)
  );
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/lexisnexis/verify",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, VerifyRequest>, res: Response) => {
    const { kratos_identity_id } = req.body;
    if (!kratos_identity_id) {
      res.status(400).json({ error: "kratos_identity_id required" });
      return;
    }

    try {
      const result = await callInstantID(req.body);
      const status = isVerified(result) ? "verified" : "failed";

      await kratos.patchIdentity({
        id: kratos_identity_id,
        jsonPatch: [
          { op: JsonPatchOpEnum.Replace, path: "/metadata_public/lexisnexis_verification_status", value: status },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_public/lexisnexis_cvi_score", value: result.comprehensiveVerification },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_public/lexisnexis_verified_at", value: new Date().toISOString() },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_admin/lexisnexis_nas_score", value: result.nameAddressSSNSummary },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_admin/lexisnexis_nap_score", value: result.nameAddressPhoneSummary },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_admin/lexisnexis_verification_indicator", value: result.verificationIndicator },
        ],
      });

      res.json({ success: true, verification_status: status });
    } catch (err) {
      console.error("LexisNexis verify error:", (err as Error).message);
      try {
        await kratos.patchIdentity({
          id: kratos_identity_id,
          jsonPatch: [
            {
              op: JsonPatchOpEnum.Replace,
              path: "/metadata_admin/lexisnexis_verification_error",
              value: (err as Error).message,
            },
          ],
        });
      } catch (e) {
        console.error("Failed to record verification error:", (e as Error).message);
      }
      res.status(200).json({ success: false, error: (err as Error).message });
    }
  },
);

app.post(
  "/lexisnexis/validate",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, ValidateRequest>, res: Response) => {
    const { kratos_identity_id, lexisnexis_verification_status, lexisnexis_cvi_score } = req.body;
    if (!kratos_identity_id || !lexisnexis_verification_status) {
      res.json({ success: true }); // no verification on file → allow
      return;
    }

    if (lexisnexis_verification_status === "verified") {
      try {
        await kratos.patchIdentity({
          id: kratos_identity_id,
          jsonPatch: [
            {
              op: JsonPatchOpEnum.Replace,
              path: "/metadata_public/lexisnexis_last_validated_at",
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

    if (lexisnexis_verification_status === "failed") {
      res.status(400).json({
        messages: [
          {
            instance_ptr: "#/",
            message: "Identity verification failed. Please contact support to verify your account.",
            type: "error",
            context: { reason: "identity_verification_failed", cvi_score: lexisnexis_cvi_score },
          },
        ],
      });
      return;
    }

    console.warn(`Unknown LexisNexis verification status: ${lexisnexis_verification_status}`);
    res.json({ success: true });
  },
);

app.listen(PORT, () => {
  console.log(`LexisNexis integration listening on port ${PORT}`);
});
