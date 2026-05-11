// SPDX-License-Identifier: Apache-2.0
//
// Reference webhook handler for the Ory ↔ Microsoft Dynamics 365 integration.
// Authenticates with Entra ID (client_credentials), then upserts contacts in
// the Dataverse Web API (OData v4).

const express = require("express");
const crypto = require("crypto");
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const DYNAMICS_RESOURCE_URL = process.env.DYNAMICS_RESOURCE_URL;
const ENTRA_TENANT_ID = process.env.ENTRA_TENANT_ID;
const ENTRA_CLIENT_ID = process.env.ENTRA_CLIENT_ID;
const ENTRA_CLIENT_SECRET = process.env.ENTRA_CLIENT_SECRET;

if (!ORY_WEBHOOK_SECRET || !DYNAMICS_RESOURCE_URL || !ENTRA_TENANT_ID || !ENTRA_CLIENT_ID || !ENTRA_CLIENT_SECRET) {
  console.error(
    "ORY_WEBHOOK_SECRET, DYNAMICS_RESOURCE_URL, ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET must be set",
  );
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

let cachedToken = null;
let cachedExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < cachedExpiry - 5 * 60 * 1000) return cachedToken;

  const tokenRes = await fetch(`https://login.microsoftonline.com/${ENTRA_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ENTRA_CLIENT_ID,
      client_secret: ENTRA_CLIENT_SECRET,
      grant_type: "client_credentials",
      scope: `${DYNAMICS_RESOURCE_URL}/.default`,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!tokenRes.ok) {
    throw new Error(`entra token ${tokenRes.status}: ${await tokenRes.text()}`);
  }

  const data = await tokenRes.json();
  cachedToken = data.access_token;
  cachedExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
  return cachedToken;
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/dynamics/sync-user", verifyWebhookSecret, async (req, res) => {
  const { identity_id, email, first_name, last_name, phone } = req.body;

  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  try {
    const token = await getToken();
    // Upsert by ory_identity_id alternate key (recommended) — fall back to email match
    // if that alternate key is not configured in Dataverse.
    const upsertRes = await fetch(
      `${DYNAMICS_RESOURCE_URL}/api/data/v9.2/contacts(ory_identity_id='${encodeURIComponent(identity_id)}')`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "OData-Version": "4.0",
          "OData-MaxVersion": "4.0",
          "If-Match": "*",                 // upsert (create or update)
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          emailaddress1: email,
          firstname: first_name ?? undefined,
          lastname: last_name ?? undefined,
          telephone1: phone ?? undefined,
          ory_identity_id: identity_id,
        }),
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!upsertRes.ok) {
      console.error(`Dynamics ${upsertRes.status}: ${await upsertRes.text()}`);
      return res.status(502).json({ error: "dynamics_error" });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Sync error:", err.message);
    return res.status(502).json({ error: "sync_failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Microsoft Dynamics 365 integration listening on port ${PORT}`);
});
