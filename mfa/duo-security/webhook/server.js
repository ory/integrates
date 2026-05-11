// SPDX-License-Identifier: Apache-2.0
//
// Reference webhook handler for the Ory ↔ Duo Security integration.
// Sends a Duo push, polls /auth_status until the user responds (or the deadline
// elapses), and returns the verdict so an Ory Action can step up authentication.

const express = require("express");
const crypto = require("crypto");
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const DUO_API_HOST = process.env.DUO_API_HOST;
const DUO_INTEGRATION_KEY = process.env.DUO_INTEGRATION_KEY;
const DUO_SECRET_KEY = process.env.DUO_SECRET_KEY;
const POLL_DEADLINE_MS = Number.parseInt(process.env.DUO_POLL_DEADLINE_SECONDS || "45", 10) * 1000;

if (!ORY_WEBHOOK_SECRET || !DUO_API_HOST || !DUO_INTEGRATION_KEY || !DUO_SECRET_KEY) {
  console.error("ORY_WEBHOOK_SECRET, DUO_API_HOST, DUO_INTEGRATION_KEY, DUO_SECRET_KEY must be set");
  process.exit(1);
}

const app = express();
app.use(express.json());

function verifyWebhookSecret(req, res, next) {
  const provided = req.header("x-webhook-secret") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(ORY_WEBHOOK_SECRET);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "invalid webhook secret" });
  }
  return next();
}

// Duo Auth API v2 request signing (HMAC-SHA1 over a canonicalized request).
// https://duo.com/docs/authapi#authentication
function signDuoRequest(method, path, params, dateStr) {
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");
  const canonical = [dateStr, method.toUpperCase(), DUO_API_HOST.toLowerCase(), path, sortedParams].join("\n");
  const sig = crypto.createHmac("sha1", DUO_SECRET_KEY).update(canonical).digest("hex");
  const auth = Buffer.from(`${DUO_INTEGRATION_KEY}:${sig}`).toString("base64");
  return { authorization: `Basic ${auth}`, date: dateStr };
}

async function duoCall(method, path, params) {
  const dateStr = new Date().toUTCString();
  const { authorization, date } = signDuoRequest(method, path, params, dateStr);
  const url = new URL(`https://${DUO_API_HOST}${path}`);
  const init = {
    method,
    headers: { authorization, date, accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  };
  if (method === "POST") {
    init.headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = new URLSearchParams(params).toString();
  } else {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url, init);
  const body = await res.json();
  return { ok: res.ok, status: res.status, body };
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/duo/challenge", verifyWebhookSecret, async (req, res) => {
  const { duo_username, client_ip } = req.body;

  if (!duo_username) {
    return res.status(400).json({ error: "duo_username is required" });
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

    if (!init.ok || !init.body?.response?.txid) {
      console.error(`Duo auth init ${init.status}: ${JSON.stringify(init.body)}`);
      return res.status(502).json({ error: "duo_init_failed" });
    }

    const txid = init.body.response.txid;
    const deadline = Date.now() + POLL_DEADLINE_MS;
    let result = "waiting";

    // Long-poll loop. Duo's /auth_status blocks server-side until state changes
    // or its own internal timeout fires (~30s), then returns. We loop until our
    // local deadline.
    while (Date.now() < deadline) {
      const status = await duoCall("GET", "/auth/v2/auth_status", { txid });
      if (!status.ok) {
        console.error(`Duo auth_status ${status.status}: ${JSON.stringify(status.body)}`);
        return res.status(502).json({ error: "duo_status_failed" });
      }
      result = status.body?.response?.result;
      if (result && result !== "waiting") break;
    }

    return res.json({
      ok: true,
      result,                                  // "allow", "deny", "waiting" (if deadline hit)
      status_msg: req.body?.status_msg ?? null,
      mfa_passed: result === "allow",
    });
  } catch (err) {
    console.error("Duo error:", err.message);
    return res.status(502).json({ error: "duo_failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Duo Security integration listening on port ${PORT}`);
});
