// SPDX-License-Identifier: Apache-2.0
//
// LexisNexis Risk Solutions <> Ory Actions webhook handler.
//
// Two endpoints:
//   POST /lexisnexis/verify   — sync post-registration with response.parse,
//                                before the identity is saved. Calls
//                                LexisNexis InstantID, evaluates NAS/NAP/CVI
//                                scores, and returns the result in the
//                                response for Ory to save with the identity.
//   POST /lexisnexis/validate — sync post-login. Blocks login when the
//                                stored verification status is "failed".

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const LN_USERNAME = process.env.LEXISNEXIS_USERNAME;
const LN_PASSWORD = process.env.LEXISNEXIS_PASSWORD;
const LN_API_URL = process.env.LEXISNEXIS_API_URL;
const LN_ORG_ID = process.env.LEXISNEXIS_ORG_ID;

// NAS and NAP range from 0 to 12, CVI from 0 to 50 in steps of 10. Agree on
// thresholds with LexisNexis for your risk profile.
function threshold(name: string, max: number): number {
  const value = Number(process.env[name]);
  if (process.env[name] === undefined || !Number.isFinite(value) || value < 0 || value > max) {
    console.error(`${name} must be a number between 0 and ${max}.`);
    process.exit(1);
  }
  return value;
}

if (!ORY_WEBHOOK_SECRET || !LN_USERNAME || !LN_PASSWORD || !LN_API_URL || !LN_ORG_ID) {
  console.error(
    "Missing required env vars. See .env.example. Required: ORY_WEBHOOK_SECRET, LEXISNEXIS_USERNAME, LEXISNEXIS_PASSWORD, LEXISNEXIS_API_URL, LEXISNEXIS_ORG_ID, INSTANTID_NAS_THRESHOLD, INSTANTID_NAP_THRESHOLD, INSTANTID_CVI_THRESHOLD.",
  );
  process.exit(1);
}

const NAS_THRESHOLD = threshold("INSTANTID_NAS_THRESHOLD", 12);
const NAP_THRESHOLD = threshold("INSTANTID_NAP_THRESHOLD", 12);
const CVI_THRESHOLD = threshold("INSTANTID_CVI_THRESHOLD", 50);

// Ory Kratos Identities shows `text` to the user only for this response shape.
function block(res: Response, text: string): void {
  res.status(403).json({
    messages: [{ instance_ptr: "#/", messages: [{ id: 9001001, text, type: "error" }] }],
  });
}

const LN_AUTH = `Basic ${Buffer.from(`${LN_USERNAME}:${LN_PASSWORD}`).toString("base64")}`;

interface VerifyRequest {
  metadata_public?: Record<string, unknown> | null;
  first_name?: string;
  last_name?: string;
  address?: { street?: string; city?: string; state?: string; postal_code?: string };
  date_of_birth?: string;
  ssn?: string;
  phone_number?: string;
}

interface ValidateRequest {
  lexisnexis_verification_status?: string;
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
  return (
    r.verificationIndicator === "Pass" &&
    r.comprehensiveVerification >= CVI_THRESHOLD &&
    (r.nameAddressSSNSummary >= NAS_THRESHOLD || r.nameAddressPhoneSummary >= NAP_THRESHOLD)
  );
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Runs before the identity is saved, so the identity ID is the nil UUID and
// the identity isn't in the Admin API yet. The result goes back in the
// response body, and Ory saves it with the new identity. Ory replaces
// metadata_public with the returned object, so the existing values are merged in.
app.post(
  "/lexisnexis/verify",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, VerifyRequest>, res: Response) => {
    let result: InstantIDResult;
    try {
      result = await callInstantID(req.body);
    } catch (err) {
      console.error("LexisNexis verify error:", (err as Error).message);
      block(res, "We couldn't verify your identity right now. Please try again later.");
      return;
    }

    if (!isVerified(result)) {
      console.log(
        `LexisNexis verify failed: indicator=${result.verificationIndicator} nas=${result.nameAddressSSNSummary} nap=${result.nameAddressPhoneSummary} cvi=${result.comprehensiveVerification}`,
      );
      block(res, "We couldn't verify your identity.");
      return;
    }

    res.json({
      identity: {
        metadata_public: {
          ...(req.body.metadata_public ?? {}),
          lexisnexis_verification_status: "verified",
          lexisnexis_cvi_score: result.comprehensiveVerification,
          lexisnexis_verified_at: new Date().toISOString(),
        },
      },
    });
  },
);

// Ory Kratos Identities ignores identity changes in a login.after response,
// so this only decides.
app.post(
  "/lexisnexis/validate",
  verifyWebhookSecret,
  (req: Request<unknown, unknown, ValidateRequest>, res: Response) => {
    if (req.body.lexisnexis_verification_status === "failed") {
      block(res, "Identity verification failed. Please contact support to verify your account.");
      return;
    }
    res.json({});
  },
);

app.listen(PORT, () => {
  console.log(`LexisNexis integration listening on port ${PORT}`);
});
