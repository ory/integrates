// SPDX-License-Identifier: Apache-2.0
//
// Reference webhook handler for the Ory ↔ Socure integration.
// Two endpoints:
//   POST /socure/verify-identity      — synchronous Ory Action call → Socure ID+
//   POST /socure/results-callback     — async callback FROM Socure with final decision
//                                       (signed; verified via HMAC)

const express = require("express");
const crypto = require("crypto");
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const SOCURE_API_BASE = process.env.SOCURE_API_BASE || "https://api.socure.com";
const SOCURE_API_KEY = process.env.SOCURE_API_KEY;
const SOCURE_MODULES = (process.env.SOCURE_MODULES || "kyc,fraud").split(",").map((s) => s.trim()).filter(Boolean);
const SOCURE_CALLBACK_SECRET = process.env.SOCURE_CALLBACK_SECRET;

if (!ORY_WEBHOOK_SECRET || !SOCURE_API_KEY) {
  console.error("ORY_WEBHOOK_SECRET and SOCURE_API_KEY must be set in .env");
  process.exit(1);
}

const app = express();

// Capture the raw body for HMAC verification on Socure callbacks.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

function verifyWebhookSecret(req, res, next) {
  const provided = req.header("x-webhook-secret") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(ORY_WEBHOOK_SECRET);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "invalid webhook secret" });
  }
  return next();
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/socure/verify-identity", verifyWebhookSecret, async (req, res) => {
  const { identity_id, email, first_name, last_name, date_of_birth, ssn, address, device_session_id } = req.body;

  if (!email || !first_name || !last_name) {
    return res.status(400).json({ error: "email, first_name, last_name are required" });
  }

  try {
    const socureRes = await fetch(`${SOCURE_API_BASE}/api/3.0/EmailAuthScore`, {
      method: "POST",
      headers: {
        "SocureApiKey": SOCURE_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        modules: SOCURE_MODULES,
        firstName: first_name,
        surName: last_name,
        email,
        dob: date_of_birth,
        nationalId: ssn,
        physicalAddress: address?.street1,
        city: address?.city,
        state: address?.state,
        zip: address?.zip,
        country: address?.country ?? "US",
        deviceSessionId: device_session_id,
        customerUserId: identity_id,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!socureRes.ok) {
      console.error(`Socure ${socureRes.status}: ${await socureRes.text()}`);
      return res.status(502).json({ error: "socure_error" });
    }

    const result = await socureRes.json();
    return res.json({
      ok: true,
      reference_id: result.referenceId,
      decision: result.kyc?.fieldValidations ?? null,
      fraud_score: result.fraud?.scores?.[0]?.score ?? null,
    });
  } catch (err) {
    console.error("Verify error:", err.message);
    return res.status(502).json({ error: "verify_failed" });
  }
});

// Async result callback from Socure. HMAC-SHA256 of the raw body using the shared secret,
// delivered in the X-Socure-Signature header (configure this in the Socure admin).
app.post("/socure/results-callback", (req, res) => {
  if (!SOCURE_CALLBACK_SECRET) {
    return res.status(503).json({ error: "callback_disabled" });
  }
  const sig = req.header("x-socure-signature") || "";
  const expected = crypto.createHmac("sha256", SOCURE_CALLBACK_SECRET).update(req.rawBody).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "invalid signature" });
  }

  // TODO: write the result back to the Ory identity via the Admin API
  //   (e.g. PATCH /admin/identities/<id> with the verification verdict in metadata.public).
  console.log("Socure async result:", req.body.referenceId, req.body.decision);
  return res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Socure integration listening on port ${PORT}`);
});
