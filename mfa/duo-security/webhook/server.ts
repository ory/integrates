// SPDX-License-Identifier: Apache-2.0
//
// Reference webhook handler for the Ory <> Duo Security integration.
// Verifies a Duo passcode that the login UI collected with the primary
// credentials and blocks the sign-in unless Duo allows it.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const DUO_API_HOST = process.env.DUO_API_HOST;
const DUO_INTEGRATION_KEY = process.env.DUO_INTEGRATION_KEY;
const DUO_SECRET_KEY = process.env.DUO_SECRET_KEY;

if (!ORY_WEBHOOK_SECRET || !DUO_API_HOST || !DUO_INTEGRATION_KEY || !DUO_SECRET_KEY) {
  console.error(
    "ORY_WEBHOOK_SECRET, DUO_API_HOST, DUO_INTEGRATION_KEY, DUO_SECRET_KEY must be set",
  );
  process.exit(1);
}

interface OryDuoRequest {
  username?: string;
  passcode?: string | null;
  ipaddr?: string | null;
}

interface DuoSignedHeaders {
  authorization: string;
  date: string;
}

interface DuoCallResult {
  ok: boolean;
  status: number;
  body: {
    response?: {
      result?: string;
      status?: string;
      status_msg?: string;
    };
    [key: string]: unknown;
  };
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

// Duo Auth API v2 request signing (HMAC-SHA1 over a canonicalized request).
// https://duo.com/docs/authapi#authentication
function signDuoRequest(
  method: string,
  path: string,
  params: Record<string, string>,
  dateStr: string,
): DuoSignedHeaders {
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k] as string)}`)
    .join("&");
  const canonical = [
    dateStr,
    method.toUpperCase(),
    (DUO_API_HOST as string).toLowerCase(),
    path,
    sortedParams,
  ].join("\n");
  const sig = crypto
    .createHmac("sha1", DUO_SECRET_KEY as string)
    .update(canonical)
    .digest("hex");
  const auth = Buffer.from(`${DUO_INTEGRATION_KEY}:${sig}`).toString("base64");
  return { authorization: `Basic ${auth}`, date: dateStr };
}

async function duoCall(
  method: "GET" | "POST",
  path: string,
  params: Record<string, string>,
): Promise<DuoCallResult> {
  const dateStr = new Date().toUTCString();
  const { authorization, date } = signDuoRequest(method, path, params, dateStr);
  const url = new URL(`https://${DUO_API_HOST}${path}`);
  const headers: Record<string, string> = {
    authorization,
    date,
    accept: "application/json",
  };
  let body: string | undefined;
  if (method === "POST") {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(params).toString();
  } else {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    method,
    headers,
    ...(body !== undefined && { body }),
    signal: AbortSignal.timeout(10000),
  });
  const responseBody = (await res.json()) as DuoCallResult["body"];
  return { ok: res.ok, status: res.status, body: responseBody };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Ory Kratos Identities shows these messages to the user when the handler
// responds with a 4xx status code. Ory retries a 5xx, so every failure after
// the passcode reached Duo is reported as a 4xx.
function block(res: Response, status: number, id: number, text: string) {
  res.status(status).json({
    messages: [
      {
        instance_ptr: "#/",
        messages: [{ id, text, type: "error" }],
      },
    ],
  });
}

app.post(
  "/duo/verify",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OryDuoRequest>, res: Response) => {
    const { username, passcode, ipaddr } = req.body ?? {};

    if (!username) {
      block(res, 400, 9001001, "Duo verification failed. Please contact support.");
      return;
    }
    if (!passcode) {
      block(res, 403, 9001002, "Enter your Duo passcode.");
      return;
    }

    try {
      const params: Record<string, string> = {
        username,
        factor: "passcode",
        passcode,
      };
      if (ipaddr) params.ipaddr = ipaddr;

      const auth = await duoCall("POST", "/auth/v2/auth", params);
      const result = auth.body?.response?.result;
      if (!auth.ok || !result) {
        console.error(`Duo auth ${auth.status}: ${JSON.stringify(auth.body)}`);
        block(res, 403, 9001003, "Duo verification is unavailable. Please try again.");
        return;
      }

      if (result !== "allow") {
        block(res, 403, 9001004, "Duo verification failed.");
        return;
      }

      res.status(200).json({});
    } catch (err) {
      console.error("Duo error:", (err as Error).message);
      block(res, 403, 9001003, "Duo verification is unavailable. Please try again.");
    }
  },
);

app.listen(PORT, () => {
  console.log(`Duo Security integration listening on port ${PORT}`);
});
