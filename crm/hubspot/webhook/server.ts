// SPDX-License-Identifier: Apache-2.0
//
// Reference webhook handler for the Ory <> HubSpot integration.
// Creates or updates a HubSpot CRM contact from an Ory Action webhook,
// storing the Ory identity id on the contact's `ory_identity_id` custom
// property so it round-trips through downstream HubSpot workflows.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const HUBSPOT_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;

if (!HUBSPOT_TOKEN || !ORY_WEBHOOK_SECRET) {
  console.error("HUBSPOT_PRIVATE_APP_TOKEN and ORY_WEBHOOK_SECRET must be set in .env");
  process.exit(1);
}

interface HubspotSyncRequest {
  identity_id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

interface HubspotContactCreateError {
  message?: string;
}

const HUBSPOT_HEADERS = {
  authorization: `Bearer ${HUBSPOT_TOKEN}`,
  "content-type": "application/json",
};

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

app.post(
  "/hubspot/sync-user",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, HubspotSyncRequest>, res: Response) => {
    const { identity_id, email, first_name, last_name } = req.body;
    if (!email) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    try {
      const createRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
        method: "POST",
        headers: HUBSPOT_HEADERS,
        body: JSON.stringify({
          properties: {
            email,
            firstname: first_name,
            lastname: last_name,
            ory_identity_id: identity_id,
          },
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (createRes.status === 409) {
        // 409 = contact already exists; HubSpot embeds the existing ID in the
        // error message body. PATCH onto that ID to keep the upsert idempotent.
        const detail = (await createRes.json().catch(() => ({}))) as HubspotContactCreateError;
        const existingId = detail.message?.match(/Existing ID: (\d+)/)?.[1];
        if (existingId) {
          const patchRes = await fetch(
            `https://api.hubapi.com/crm/v3/objects/contacts/${existingId}`,
            {
              method: "PATCH",
              headers: HUBSPOT_HEADERS,
              body: JSON.stringify({
                properties: {
                  firstname: first_name,
                  lastname: last_name,
                  ory_identity_id: identity_id,
                },
              }),
              signal: AbortSignal.timeout(10000),
            },
          );
          if (!patchRes.ok) {
            console.error(`HubSpot PATCH ${patchRes.status}: ${await patchRes.text()}`);
            res.status(502).json({ error: "hubspot_error" });
            return;
          }
        }
      } else if (!createRes.ok) {
        console.error(`HubSpot ${createRes.status}: ${await createRes.text()}`);
        res.status(502).json({ error: "hubspot_error" });
        return;
      }

      res.json({ ok: true });
    } catch (err) {
      console.error("Sync error:", (err as Error).message);
      res.status(502).json({ error: "sync_failed" });
    }
  },
);

app.listen(PORT, () => {
  console.log(`HubSpot integration listening on port ${PORT}`);
});
