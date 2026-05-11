// SPDX-License-Identifier: Apache-2.0
//
// Reference webhook handler for an Ory Action.
// Receives an Ory webhook, verifies the shared secret, and forwards to a
// third-party API. Replace the TODO sections with your vendor-specific logic.

const express = require("express");
const crypto = require("crypto");
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const VENDOR_API_BASE = process.env.VENDOR_API_BASE || "https://api.example.com";
const VENDOR_API_TOKEN = process.env.VENDOR_API_TOKEN;

if (!ORY_WEBHOOK_SECRET) {
  console.error("ORY_WEBHOOK_SECRET must be set in .env");
  process.exit(1);
}

const app = express();
app.use(express.json());

// Timing-safe comparison so we don't leak the secret via response timing.
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

app.post("/<integration>/sync-user", verifyWebhookSecret, async (req, res) => {
  const { identity_id, email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  // Use the built-in fetch (Node >=18) — no axios/got/node-fetch needed.
  // AbortSignal.timeout caps the call so a slow vendor doesn't pin the worker.
  try {
    const vendorRes = await fetch(`${VENDOR_API_BASE}/v1/contacts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(VENDOR_API_TOKEN && { authorization: `Bearer ${VENDOR_API_TOKEN}` }),
      },
      body: JSON.stringify({ external_id: identity_id, email }),
      signal: AbortSignal.timeout(5000),
    });

    if (!vendorRes.ok) {
      const detail = await vendorRes.text();
      console.error(`Vendor API ${vendorRes.status}: ${detail}`);
      // 5xx tells Ory to retry per the action's retry policy; 4xx would be terminal.
      return res.status(502).json({ error: "sync_failed" });
    }

    console.log(`Synced identity ${identity_id} (${email})`);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Sync error:", err.message);
    return res.status(502).json({ error: "sync_failed" });
  }
});

app.listen(PORT, () => {
  console.log(`<Integration> webhook listening on port ${PORT}`);
});
