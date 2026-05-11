// SPDX-License-Identifier: Apache-2.0
//
// Prove (phone-anchored identity) <> Ory Actions webhook handler.
//
// Three endpoints — all sync Ory Action calls authenticated by the shared
// ORY_WEBHOOK_SECRET. The handler uses Prove's official SDK
// (@prove-identity/prove-api) for the API surface.
//
//   POST /prove/lookup    pre-registration phone-number lookup. Returns
//                          identity-prefill metadata if Prove knows the
//                          phone number.
//   POST /prove/enroll    post-registration enrollment. Registers the
//                          user's phone number with Prove's Identity Manager
//                          and stores the resulting prove_identity_id.
//   POST /prove/validate  post-login validation. Confirms the user's stored
//                          phone matches what Prove has on file; blocks login
//                          on mismatch.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { Proveapi } from "@prove-identity/prove-api";
import { Configuration, IdentityApi, JsonPatchOpEnum } from "@ory/client";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const KRATOS_ADMIN_URL = process.env.KRATOS_ADMIN_URL;
const ORY_API_KEY = process.env.ORY_API_KEY;
const PROVE_CLIENT_ID = process.env.PROVE_CLIENT_ID;
const PROVE_CLIENT_SECRET = process.env.PROVE_CLIENT_SECRET;
const PROVE_SERVER_URL = process.env.PROVE_SERVER_URL ?? "https://platform.uat.proveapis.com";

if (
  !ORY_WEBHOOK_SECRET ||
  !KRATOS_ADMIN_URL ||
  !ORY_API_KEY ||
  !PROVE_CLIENT_ID ||
  !PROVE_CLIENT_SECRET
) {
  console.error(
    "Missing required env vars. See .env.example. Required: ORY_WEBHOOK_SECRET, KRATOS_ADMIN_URL, ORY_API_KEY, PROVE_CLIENT_ID, PROVE_CLIENT_SECRET.",
  );
  process.exit(1);
}

const prove = new Proveapi({
  serverURL: PROVE_SERVER_URL,
  security: { clientID: PROVE_CLIENT_ID, clientSecret: PROVE_CLIENT_SECRET },
});

const kratos = new IdentityApi(
  new Configuration({ basePath: KRATOS_ADMIN_URL, accessToken: ORY_API_KEY }),
);

interface LookupRequest {
  phone_number?: string;
}

interface EnrollRequest {
  kratos_identity_id?: string;
  phone_number?: string;
}

interface ValidateRequest {
  kratos_identity_id?: string;
  phone_number?: string;
  prove_identity_id?: string;
}

// Prove's SDK uses generated types that vary by version; unwrap the response
// envelope defensively. Each response has either {<methodName>Response: {...}}
// or a direct payload depending on the SDK version.
function unwrap<T>(resp: unknown, key: string): T | undefined {
  if (resp && typeof resp === "object") {
    const direct = (resp as Record<string, unknown>)[key];
    if (direct && typeof direct === "object") return direct as T;
    return resp as T;
  }
  return undefined;
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

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Pre-fill identity traits from Prove's phone-anchored identity graph.
app.post(
  "/prove/lookup",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, LookupRequest>, res: Response) => {
    const { phone_number } = req.body;
    if (!phone_number) {
      res.status(400).json({ error: "phone_number is required" });
      return;
    }

    try {
      const lookup = await prove.identity.v3GetIdentitiesByPhoneNumber(phone_number);
      const list = unwrap<{ items?: unknown[] }>(lookup, "v3GetIdentitiesByPhoneNumberResponse");
      const items = Array.isArray(list?.items) ? list.items : Array.isArray(lookup) ? lookup : [];

      if (items.length === 0) {
        res.json({
          identity: {
            metadata_public: {
              prove_identity_status: "not_found",
              prove_lookup_timestamp: new Date().toISOString(),
            },
          },
        });
        return;
      }

      const first = items[0] as Record<string, unknown>;
      const provedIdentityId =
        (first.identityId as string | undefined) ?? (first.identity_id as string | undefined);
      if (!provedIdentityId) {
        res.json({
          identity: {
            metadata_public: { prove_identity_status: "lookup_error" },
            metadata_admin: { prove_error_message: "missing identityId in lookup item" },
          },
        });
        return;
      }

      const detailResp = await prove.identity.v3GetIdentity(provedIdentityId);
      const details =
        unwrap<Record<string, unknown>>(detailResp, "v3GetIdentityResponse") ??
        (detailResp as Record<string, unknown>);

      if (!details || details.success !== true) {
        res.json({
          identity: {
            metadata_public: {
              prove_identity_status: "lookup_error",
            },
            metadata_admin: {
              prove_error_message: "Could not retrieve identity details",
            },
          },
        });
        return;
      }

      res.json({
        identity: {
          traits: { phone_number: (details.phoneNumber as string | undefined) ?? phone_number },
          metadata_public: {
            prove_identity_status: "verified",
            prove_identity_id: details.identityId,
            prove_phone_number: details.phoneNumber,
            prove_carrier: details.carrier,
            prove_line_type: details.lineType,
            prove_is_active: details.active,
            prove_lookup_timestamp: new Date().toISOString(),
          },
          metadata_admin: {
            prove_correlation_id: first.correlationId,
            prove_client_customer_id: first.clientCustomerId,
            prove_country_code: details.countryCode,
          },
        },
      });
    } catch (err) {
      console.error("Prove lookup error:", (err as Error).message);
      res.json({
        identity: {
          metadata_public: { prove_identity_status: "lookup_error" },
          metadata_admin: { prove_error_message: (err as Error).message },
        },
      });
    }
  },
);

// Enroll the user's phone number in Prove's Identity Manager.
app.post(
  "/prove/enroll",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, EnrollRequest>, res: Response) => {
    const { kratos_identity_id, phone_number } = req.body;
    if (!kratos_identity_id || !phone_number) {
      res.status(400).json({ error: "kratos_identity_id and phone_number are required" });
      return;
    }

    try {
      const enrollResp = await prove.identity.v3EnrollIdentity({
        phoneNumber: phone_number,
        clientCustomerId: kratos_identity_id,
      });
      const enrollData =
        unwrap<Record<string, unknown>>(enrollResp, "v3EnrollIdentityResponse") ??
        (enrollResp as Record<string, unknown>);

      if (!enrollData || enrollData.success !== true) {
        throw new Error(`Enrollment failed: ${enrollData?.verificationResult ?? "unknown error"}`);
      }

      await kratos.patchIdentity({
        id: kratos_identity_id,
        jsonPatch: [
          { op: JsonPatchOpEnum.Replace, path: "/metadata_public/prove_identity_enrolled", value: true },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_public/prove_identity_id", value: enrollData.identityId },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_public/prove_verification_result", value: enrollData.verificationResult },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_public/prove_enrollment_timestamp", value: new Date().toISOString() },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_admin/prove_correlation_id", value: enrollData.correlationId },
          { op: JsonPatchOpEnum.Replace, path: "/metadata_admin/prove_client_customer_id", value: enrollData.clientCustomerId },
        ],
      });

      res.json({ success: true, prove_identity_id: enrollData.identityId });
    } catch (err) {
      console.error("Prove enrollment error:", (err as Error).message);
      try {
        await kratos.patchIdentity({
          id: kratos_identity_id,
          jsonPatch: [
            { op: JsonPatchOpEnum.Replace, path: "/metadata_admin/prove_enrollment_error", value: (err as Error).message },
            { op: JsonPatchOpEnum.Replace, path: "/metadata_admin/prove_enrollment_attempted", value: new Date().toISOString() },
          ],
        });
      } catch (e) {
        console.error("Failed to record enrollment error:", (e as Error).message);
      }
      res.json({ success: false, error: (err as Error).message });
    }
  },
);

// Post-login validation: confirm the stored phone matches what Prove has.
app.post(
  "/prove/validate",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, ValidateRequest>, res: Response) => {
    const { kratos_identity_id, phone_number, prove_identity_id } = req.body;
    if (!kratos_identity_id) {
      res.status(400).json({ error: "kratos_identity_id required" });
      return;
    }
    if (!prove_identity_id) {
      res.json({
        identity: {
          metadata_public: {
            prove_validation_status: "not_enrolled",
            prove_last_validation: new Date().toISOString(),
          },
        },
      });
      return;
    }

    try {
      const identityResp = await prove.identity.v3GetIdentity(prove_identity_id);
      const data =
        unwrap<Record<string, unknown>>(identityResp, "v3GetIdentityResponse") ??
        (identityResp as Record<string, unknown>);

      if (!data || data.success !== true) {
        res.json({
          identity: {
            metadata_public: {
              prove_validation_status: "retrieval_failed",
              prove_last_validation: new Date().toISOString(),
            },
            metadata_admin: { prove_validation_error: "Failed to retrieve identity from Prove" },
          },
        });
        return;
      }

      const provePhone = data.phoneNumber as string | undefined;
      if (phone_number && provePhone && provePhone !== phone_number) {
        res.status(400).json({
          messages: [
            {
              instance_ptr: "#/",
              message: "Your phone number has changed. Please update your account information.",
              type: "error",
              context: {
                reason: "phone_number_mismatch",
                prove_phone: provePhone,
                registered_phone: phone_number,
              },
            },
          ],
        });
        return;
      }

      const verificationResult = data.verificationResult;
      const updates = [
        { op: JsonPatchOpEnum.Replace, path: "/metadata_public/prove_validation_status", value: "verified" },
        { op: JsonPatchOpEnum.Replace, path: "/metadata_public/prove_verification_result", value: verificationResult },
        { op: JsonPatchOpEnum.Replace, path: "/metadata_public/prove_last_validation", value: new Date().toISOString() },
        { op: JsonPatchOpEnum.Replace, path: "/metadata_public/prove_phone_verified", value: provePhone },
        { op: JsonPatchOpEnum.Replace, path: "/metadata_admin/prove_correlation_id", value: data.correlationId },
      ];

      await kratos.patchIdentity({ id: kratos_identity_id, jsonPatch: updates });

      res.json({
        identity: {
          metadata_public: {
            prove_validation_status: "verified",
            prove_verification_result: verificationResult,
            prove_last_validation: new Date().toISOString(),
            prove_phone_verified: provePhone,
          },
          metadata_admin: { prove_correlation_id: data.correlationId },
        },
      });
    } catch (err) {
      console.error("Prove validation error:", (err as Error).message);
      res.json({
        identity: {
          metadata_public: {
            prove_validation_status: "validation_error",
            prove_last_validation: new Date().toISOString(),
          },
          metadata_admin: { prove_validation_error: (err as Error).message },
        },
      });
    }
  },
);

app.listen(PORT, () => {
  console.log(`Prove integration listening on port ${PORT}`);
});
