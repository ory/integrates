// SPDX-License-Identifier: Apache-2.0
//
// Stripe <> Ory Actions webhook handler.
//
// Two synchronous hooks (response.parse: true) so Ory reads the response and
// applies the returned metadata to the identity:
//
//   1. Post-registration — creates a Stripe Customer keyed to the Ory
//      identity, stores the customer ID in metadata_admin.stripe_customer_id,
//      and seeds metadata_public.billing with a "free / none" baseline.
//
//   2. Post-login — looks up the customer's current subscription and rewrites
//      metadata_public.billing with status, plan, and current_period_end so
//      the application can gate features without an extra round trip.
//
// Both hooks fail open: if Stripe is unreachable, the handler returns 200
// with no metadata changes so authentication never breaks because of Stripe
// availability. The Stripe official SDK is kept (not replaced with fetch)
// because it transparently handles form encoding, retries on 5xx, and
// Stripe's API-version pin.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import Stripe from "stripe";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_API_VERSION =
  (process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion | undefined) ??
  ("2025-02-24.acacia" as Stripe.LatestApiVersion);

if (!ORY_WEBHOOK_SECRET || !STRIPE_SECRET_KEY) {
  console.error("ORY_WEBHOOK_SECRET and STRIPE_SECRET_KEY must be set in .env");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION,
  timeout: 5000,
  maxNetworkRetries: 2,
});

interface OryIdentity {
  id: string;
  traits?: {
    email?: string;
    name?: { first?: string; last?: string };
  };
  metadata_admin?: {
    stripe_customer_id?: string;
  };
}

interface OryWebhookBody {
  identity: OryIdentity;
}

interface BillingMetadata {
  customer_id: string;
  status: string;
  plan: string;
  current_period_end?: string;
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

// Sync post-registration: create Stripe Customer, return identity-metadata
// updates so Ory writes them onto the new identity.
app.post(
  "/stripe/registration",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OryWebhookBody>, res: Response) => {
    const identity = req.body?.identity;
    const email = identity?.traits?.email;
    if (!identity?.id || !email) {
      console.warn("Stripe registration: missing identity.id or email; skipping");
      res.status(200).json({});
      return;
    }

    try {
      const name =
        [identity.traits?.name?.first, identity.traits?.name?.last]
          .filter((s): s is string => Boolean(s))
          .join(" ") || undefined;

      // Idempotency key derived from the identity id so a retried webhook never
      // creates a duplicate customer.
      const customer = await stripe.customers.create(
        {
          email,
          name,
          metadata: { ory_identity_id: identity.id },
        },
        { idempotencyKey: `ory-customer-${identity.id}` },
      );

      console.log(`Stripe: created customer ${customer.id} for ${identity.id}`);
      res.json({
        identity: {
          metadata_admin: { stripe_customer_id: customer.id },
          metadata_public: {
            billing: { customer_id: customer.id, status: "free", plan: "none" },
          },
        },
      });
    } catch (err) {
      // Fail open: registration must not be blocked by Stripe availability.
      console.error(`Stripe customer.create failed: ${(err as Error).message}`);
      res.status(200).json({});
    }
  },
);

// Sync post-login: enrich session metadata with current subscription state.
app.post(
  "/stripe/login",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, OryWebhookBody>, res: Response) => {
    const identity = req.body?.identity;
    const customerId = identity?.metadata_admin?.stripe_customer_id;
    if (!customerId) {
      res.status(200).json({}); // no customer linked
      return;
    }

    try {
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 1,
        expand: ["data.items.data.price.product"],
      });

      let billing: BillingMetadata;
      if (subs.data.length === 0) {
        billing = { customer_id: customerId, status: "free", plan: "none" };
      } else {
        const sub = subs.data[0];
        if (!sub) {
          billing = { customer_id: customerId, status: "free", plan: "none" };
        } else {
          const product = sub.items?.data?.[0]?.price?.product;
          const planName =
            product && typeof product === "object" && "name" in product && typeof product.name === "string"
              ? product.name
              : "unknown";
          billing = {
            customer_id: customerId,
            status: sub.status,
            plan: planName,
            ...(sub.current_period_end && {
              current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            }),
          };
        }
      }

      res.json({ identity: { metadata_public: { billing } } });
    } catch (err) {
      // Fail open: login must not be blocked by Stripe availability.
      console.error(`Stripe subscriptions.list failed: ${(err as Error).message}`);
      res.status(200).json({});
    }
  },
);

app.listen(PORT, () => {
  console.log(`Stripe webhook listening on port ${PORT}`);
});
