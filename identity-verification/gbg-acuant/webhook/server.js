// SPDX-License-Identifier: Apache-2.0
//
// Reference webhook handler for the Ory ↔ GBG (Acuant) integration.
// Receives an Ory Action webhook on registration, posts the identity payload to
// a GBG GO Journey, and returns the GBG decision so Ory can gate the flow.

const express = require("express");
const crypto = require("crypto");
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const GBG_API_BASE = process.env.GBG_API_BASE || "https://api.gbgplc.com";
const GBG_API_TOKEN = process.env.GBG_API_TOKEN;
const GBG_JOURNEY_ID = process.env.GBG_JOURNEY_ID;

if (!ORY_WEBHOOK_SECRET || !GBG_API_TOKEN || !GBG_JOURNEY_ID) {
  console.error("ORY_WEBHOOK_SECRET, GBG_API_TOKEN and GBG_JOURNEY_ID must be set in .env");
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

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/gbg/verify-identity", verifyWebhookSecret, async (req, res) => {
  const { identity_id, email, first_name, last_name, date_of_birth, document_image, selfie_image } = req.body;

  if (!email || !first_name || !last_name) {
    return res.status(400).json({ error: "email, first_name, last_name are required" });
  }

  try {
    const gbgRes = await fetch(`${GBG_API_BASE}/identity/journey/v1/journeys/${GBG_JOURNEY_ID}/cases`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${GBG_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        externalReference: identity_id,
        person: {
          name: { given: first_name, family: last_name },
          email,
          dateOfBirth: date_of_birth,
        },
        evidence: {
          document: document_image ? { image: document_image } : undefined,
          selfie: selfie_image ? { image: selfie_image } : undefined,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!gbgRes.ok) {
      console.error(`GBG ${gbgRes.status}: ${await gbgRes.text()}`);
      return res.status(502).json({ error: "gbg_error" });
    }

    const result = await gbgRes.json();
    // GBG returns a verification decision object; expose the bits Ory should write back.
    return res.json({
      ok: true,
      decision: result.decision ?? result.outcome,
      case_id: result.id,
      reasons: result.reasons ?? [],
    });
  } catch (err) {
    console.error("Verify error:", err.message);
    return res.status(502).json({ error: "verify_failed" });
  }
});

app.listen(PORT, () => {
  console.log(`GBG (Acuant) integration listening on port ${PORT}`);
});
