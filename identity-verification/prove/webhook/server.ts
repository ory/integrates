// SPDX-License-Identifier: Apache-2.0
//
// Prove (phone-anchored identity) <> Ory Actions webhook handler.
//
// Two endpoints, both Ory Action calls authenticated by the shared
// ORY_WEBHOOK_SECRET. The handler uses Prove's official SDK
// (@prove-identity/prove-api) for the API surface.
//
//   POST /prove/enroll    post-registration enrollment, after the identity is
//                          saved. Registers the user's phone number with
//                          Prove's Identity Manager and stores the resulting
//                          prove_identity_id in metadata_public.
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
import { Configuration, IdentityApi, type JsonPatch, JsonPatchOpEnum } from "@ory/client";

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

interface EnrollRequest {
  kratos_identity_id?: string;
  phone_number?: string;
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// Replaces the metadata objects as a whole, because a JSON Patch to a nested
// path fails while the parent object is still null.
async function mergeMetadata(
  id: string,
  update: { metadata_public?: Record<string, unknown>; metadata_admin?: Record<string, unknown> },
): Promise<void> {
  const { data: identity } = await kratos.getIdentity({ id });
  const jsonPatch: JsonPatch[] = [];
  if (update.metadata_public) {
    jsonPatch.push({
      op: JsonPatchOpEnum.Add,
      path: "/metadata_public",
      value: { ...(identity.metadata_public ?? {}), ...update.metadata_public },
    });
  }
  if (update.metadata_admin) {
    jsonPatch.push({
      op: JsonPatchOpEnum.Add,
      path: "/metadata_admin",
      value: { ...(identity.metadata_admin ?? {}), ...update.metadata_admin },
    });
  }
  await kratos.patchIdentity({ id, jsonPatch });
}

// Ory Kratos Identities shows `text` to the user only for this response shape.
function block(res: Response, text: string): void {
  res.status(403).json({
    messages: [{ instance_ptr: "#/", messages: [{ id: 9001001, text, type: "error" }] }],
  });
}

interface ValidateRequest {
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

// Enroll the user's phone number in Prove's Identity Manager. Configure this
// action without response.parse so it runs after the identity is saved and
// receives the real identity ID.
app.post(
  "/prove/enroll",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, EnrollRequest>, res: Response) => {
    const { kratos_identity_id, phone_number } = req.body;
    if (!kratos_identity_id || kratos_identity_id === NIL_UUID || !phone_number) {
      res.status(400).json({ error: "a saved kratos_identity_id and phone_number are required" });
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

      await mergeMetadata(kratos_identity_id, {
        metadata_public: {
          prove_identity_enrolled: true,
          prove_identity_id: enrollData.identityId,
          prove_verification_result: enrollData.verificationResult,
          prove_enrollment_timestamp: new Date().toISOString(),
        },
        metadata_admin: {
          prove_correlation_id: enrollData.correlationId,
          prove_client_customer_id: enrollData.clientCustomerId,
        },
      });

      res.json({ success: true, prove_identity_id: enrollData.identityId });
    } catch (err) {
      console.error("Prove enrollment error:", (err as Error).message);
      try {
        await mergeMetadata(kratos_identity_id, {
          metadata_admin: {
            prove_enrollment_error: (err as Error).message,
            prove_enrollment_attempted: new Date().toISOString(),
          },
        });
      } catch (e) {
        console.error("Failed to record enrollment error:", (e as Error).message);
      }
      res.json({ success: false, error: (err as Error).message });
    }
  },
);

// Post-login validation: confirm the stored phone matches what Prove has.
// Ory Kratos Identities ignores identity changes in a login.after response,
// so this only decides. Users without a Prove enrollment, and Prove outages,
// are let through.
app.post(
  "/prove/validate",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, ValidateRequest>, res: Response) => {
    const { phone_number, prove_identity_id } = req.body;
    if (!prove_identity_id) {
      res.json({});
      return;
    }

    try {
      const identityResp = await prove.identity.v3GetIdentity(prove_identity_id);
      const data =
        unwrap<Record<string, unknown>>(identityResp, "v3GetIdentityResponse") ??
        (identityResp as Record<string, unknown>);

      if (!data || data.success !== true) {
        console.warn(`Prove identity ${prove_identity_id} could not be retrieved`);
        res.json({});
        return;
      }

      const provePhone = data.phoneNumber as string | undefined;
      if (phone_number && provePhone && provePhone !== phone_number) {
        block(res, "We couldn't confirm your phone number. Please contact support.");
        return;
      }
      res.json({});
    } catch (err) {
      console.error("Prove validation error:", (err as Error).message);
      res.json({});
    }
  },
);

app.listen(PORT, () => {
  console.log(`Prove integration listening on port ${PORT}`);
});
