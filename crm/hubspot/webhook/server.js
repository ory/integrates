// SPDX-License-Identifier: Apache-2.0

const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

require("dotenv").config();

const PORT = process.env.PORT || 3000;
const HUBSPOT_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;

if (!HUBSPOT_TOKEN || !ORY_WEBHOOK_SECRET) {
  console.error("HUBSPOT_PRIVATE_APP_TOKEN and ORY_WEBHOOK_SECRET must be set in .env");
  process.exit(1);
}

const app = express();
app.use(express.json());

// Timing-safe comparison so we don't leak the secret via response timing.
function verifyWebhookSecret(req, res, next) {
  const provided = req.header("x-webhook-secret") || "";
  const expected = ORY_WEBHOOK_SECRET;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "invalid webhook secret" });
  }
  return next();
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/hubspot/sync-user", verifyWebhookSecret, async (req, res) => {
  const { identity_id, email, first_name, last_name } = req.body;

  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  try {
    const response = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/contacts",
      {
        properties: {
          email,
          firstname: first_name,
          lastname: last_name,
          ory_identity_id: identity_id,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${HUBSPOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        // 409 = contact already exists; treat as patch instead of create.
        validateStatus: (status) => status < 500,
      },
    );

    if (response.status === 409) {
      const existingId = response.data?.message?.match(/Existing ID: (\d+)/)?.[1];
      if (existingId) {
        await axios.patch(
          `https://api.hubapi.com/crm/v3/objects/contacts/${existingId}`,
          {
            properties: {
              firstname: first_name,
              lastname: last_name,
              ory_identity_id: identity_id,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${HUBSPOT_TOKEN}`,
              "Content-Type": "application/json",
            },
          },
        );
      }
    } else if (response.status >= 400) {
      console.error("HubSpot error:", response.status, response.data);
      return res.status(502).json({ error: "hubspot_error" });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Sync error:", err.message);
    return res.status(502).json({ error: "sync_failed" });
  }
});

app.listen(PORT, () => {
  console.log(`HubSpot integration listening on port ${PORT}`);
});
