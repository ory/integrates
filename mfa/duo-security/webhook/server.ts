// SPDX-License-Identifier: Apache-2.0
//
// Reference webhook handler for the Ory <> Duo Security integration.
// Sends a Duo push, polls /auth_status until the user responds (or the deadline
// elapses), and returns the verdict so an Ory Action can step up authentication.

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
const POLL_DEADLINE_MS =
  Number.parseInt(process.env.DUO_POLL_DEADLINE_SECONDS || "45", 10) * 1000;

if (!ORY_WEBHOOK_SECRET || !DUO_API_HOST || !DUO_INTEGRATION_KEY || !DUO_SECRET_KEY) {
  console.error(
    "ORY_WEBHOOK_SECRET, DUO_API_HOST, DUO_INTEGRATION_KEY, DUO_SECRET_KEY must be set",
  );
  process.exit(1);
}

interface OryDuoRequest {
  duo_username?: string;
  client_ip?: string;
  status_msg?: string;
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
      txid?: string;
      result?: string;
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

app.post(
  "/duo/challenge",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OryDuoRequest>, res: Response) => {
    const { duo_username, client_ip } = req.body;

    if (!duo_username) {
      res.status(400).json({ error: "duo_username is required" });
      return;
    }

    try {
      // Initiate the push asynchronously so we can poll for the response.
      const init = await duoCall("POST", "/auth/v2/auth", {
        username: duo_username,
        factor: "push",
        device: "auto",
        async: "1",
        ipaddr: client_ip || "0.0.0.0",
      });

      const txid = init.body?.response?.txid;
      if (!init.ok || !txid) {
        console.error(`Duo auth init ${init.status}: ${JSON.stringify(init.body)}`);
        res.status(502).json({ error: "duo_init_failed" });
        return;
      }

      const deadline = Date.now() + POLL_DEADLINE_MS;
      let result: string | undefined = "waiting";

      // Long-poll loop. Duo's /auth_status blocks server-side until state
      // changes or its own internal timeout fires (~30s), then returns. We
      // loop until our local deadline.
      while (Date.now() < deadline) {
        const status = await duoCall("GET", "/auth/v2/auth_status", { txid });
        if (!status.ok) {
          console.error(`Duo auth_status ${status.status}: ${JSON.stringify(status.body)}`);
          res.status(502).json({ error: "duo_status_failed" });
          return;
        }
        result = status.body?.response?.result;
        if (result && result !== "waiting") break;
      }

      res.json({
        ok: true,
        result, // "allow", "deny", "waiting" (if deadline hit)
        status_msg: req.body?.status_msg ?? null,
        mfa_passed: result === "allow",
      });
    } catch (err) {
      console.error("Duo error:", (err as Error).message);
      res.status(502).json({ error: "duo_failed" });
    }
  },
);

app.listen(PORT, () => {
  console.log(`Duo Security integration listening on port ${PORT}`);
});
