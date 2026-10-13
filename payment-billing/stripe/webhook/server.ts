// SPDX-License-Identifier: Apache-2.0
//
// Stripe <> Ory webhook handler.
//
//   1. POST /stripe/registration (Ory -> handler) — called by an asynchronous
//      post-registration Ory Action (response.ignore: true) after the identity
//      is saved. Creates a Stripe Customer tagged with metadata.ory_identity_id
//      and writes metadata_public.stripe.customer_id through the Ory Admin API.
//
//   2. POST /stripe/webhook (Stripe -> handler) — verifies the Stripe-Signature
//      header over the raw body and mirrors subscription state into
//      metadata_public.stripe on the identity linked to the Stripe Customer.

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
const ORY_SDK_URL = process.env.ORY_SDK_URL;
const ORY_ADMIN_API_KEY = process.env.ORY_ADMIN_API_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_API_VERSION =
  (process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion | undefined) ??
  ("2025-02-24.acacia" as Stripe.LatestApiVersion);

if (
  !ORY_WEBHOOK_SECRET ||
  !ORY_SDK_URL ||
  !ORY_ADMIN_API_KEY ||
  !STRIPE_SECRET_KEY ||
  !STRIPE_WEBHOOK_SECRET
) {
  console.error("Missing required env vars. See .env.example for the full list.");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION,
  timeout: 5000,
  maxNetworkRetries: 2,
});

interface OryRegistrationBody {
  identity_id?: string;
  email?: string | null;
}

interface StripeMetadata {
  customer_id?: string;
  subscription_id?: string;
  subscription_state?: string;
  plan?: string;
  current_period_end?: string;
  synced_at?: string;
  [key: string]: unknown;
}

interface OryIdentity {
  id: string;
  metadata_public?: { stripe?: StripeMetadata; [key: string]: unknown } | null;
}

type JsonPatchOp = { op: "add" | "replace"; path: string; value: unknown };

class IdentityNotFoundError extends Error {}

const app = express();

function verifyOryWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const a = Buffer.from(req.header("x-webhook-secret") ?? "");
  const b = Buffer.from(ORY_WEBHOOK_SECRET as string);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: "invalid webhook secret" });
    return;
  }
  next();
}

async function getIdentity(id: string): Promise<OryIdentity> {
  const res = await fetch(`${ORY_SDK_URL}/admin/identities/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${ORY_ADMIN_API_KEY}` },
    signal: AbortSignal.timeout(5000),
  });
  if (res.status === 404) throw new IdentityNotFoundError(`identity ${id} not found`);
  if (!res.ok) throw new Error(`Ory get identity ${res.status}`);
  return (await res.json()) as OryIdentity;
}

// Builds a JSON Patch that sets fields under metadata_public.stripe without
// overwriting other metadata. JSON Patch "add" on an existing object replaces
// it, so the parent objects are only created when they are missing.
function stripePatch(identity: OryIdentity, fields: StripeMetadata): JsonPatchOp[] {
  const ops: JsonPatchOp[] = [];
  const metadata = identity.metadata_public;
  if (metadata == null || typeof metadata !== "object") {
    ops.push({ op: "add", path: "/metadata_public", value: {} });
  }
  if (metadata?.stripe == null || typeof metadata.stripe !== "object") {
    ops.push({ op: "add", path: "/metadata_public/stripe", value: {} });
  }
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      ops.push({ op: "add", path: `/metadata_public/stripe/${key}`, value });
    }
  }
  return ops;
}

async function patchIdentity(id: string, ops: JsonPatchOp[]): Promise<void> {
  const res = await fetch(`${ORY_SDK_URL}/admin/identities/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ORY_ADMIN_API_KEY}`,
    },
    body: JSON.stringify(ops),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ory patch identity ${res.status}: ${detail}`);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Stripe signs the exact bytes it sends, so this route needs the raw body and
// must be registered before the JSON body parser.
// Serializes syncs per identity inside this process. Run a single replica, or
// replace this with a distributed lock or a per-customer queue when scaling out.
const identityLocks = new Map<string, Promise<void>>();

async function withIdentityLock(identityId: string, fn: () => Promise<void>): Promise<void> {
  const previous = identityLocks.get(identityId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(fn);
  identityLocks.set(identityId, current);
  try {
    await current;
  } finally {
    if (identityLocks.get(identityId) === current) identityLocks.delete(identityId);
  }
}

app.post(
  "/stripe/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req: Request, res: Response) => {
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        req.header("stripe-signature") ?? "",
        STRIPE_WEBHOOK_SECRET as string,
      );
    } catch (err) {
      console.warn(`Stripe signature verification failed: ${(err as Error).message}`);
      res.status(400).json({ error: "invalid signature" });
      return;
    }

    if (
      event.type !== "customer.subscription.created" &&
      event.type !== "customer.subscription.updated" &&
      event.type !== "customer.subscription.deleted"
    ) {
      res.json({ received: true });
      return;
    }

    const eventSub = event.data.object;
    const customerId = typeof eventSub.customer === "string" ? eventSub.customer : eventSub.customer.id;

    try {
      const customer = await stripe.customers.retrieve(customerId);
      const identityId = customer.deleted ? undefined : customer.metadata?.ory_identity_id;
      if (!identityId) {
        res.json({ received: true, skipped: "customer has no ory_identity_id" });
        return;
      }

      // Stripe delivers events at least once and out of order, and events can
      // share a timestamp. Each event only triggers a sync: the subscription is
      // retrieved from Stripe while holding the identity's lock, so the last
      // write always carries Stripe's current state.
      await withIdentityLock(identityId, async () => {
        const sub = await stripe.subscriptions.retrieve(eventSub.id);
        const identity = await getIdentity(identityId);
        const price = sub.items?.data?.[0]?.price;
        await patchIdentity(
          identityId,
          stripePatch(identity, {
            customer_id: customerId,
            subscription_id: sub.id,
            subscription_state: sub.status,
            plan: price?.lookup_key ?? price?.id,
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : undefined,
            synced_at: new Date().toISOString(),
          }),
        );
      });
      console.log(`Stripe: ${event.type} applied to identity ${identityId}`);
      res.json({ received: true });
    } catch (err) {
      if (err instanceof IdentityNotFoundError) {
        res.json({ received: true, skipped: "identity not found" });
        return;
      }
      // A 5xx makes Stripe retry the event later.
      console.error(`Stripe event ${event.id} failed: ${(err as Error).message}`);
      res.status(500).json({ error: "processing_failed" });
    }
  },
);

app.use(express.json());

app.post(
  "/stripe/registration",
  verifyOryWebhookSecret,
  async (req: Request<unknown, unknown, OryRegistrationBody>, res: Response) => {
    const identityId = req.body?.identity_id;
    const email = req.body?.email ?? undefined;
    if (!identityId) {
      res.status(400).json({ error: "identity_id is required" });
      return;
    }

    try {
      // The idempotency key makes Ory's retries return the same Customer.
      const customer = await stripe.customers.create(
        { email, metadata: { ory_identity_id: identityId } },
        { idempotencyKey: `ory-customer-${identityId}` },
      );

      const identity = await getIdentity(identityId);
      if (identity.metadata_public?.stripe?.customer_id !== customer.id) {
        await patchIdentity(identityId, stripePatch(identity, { customer_id: customer.id }));
      }

      console.log(`Stripe: linked customer ${customer.id} to identity ${identityId}`);
      res.json({ ok: true });
    } catch (err) {
      // Ory retries 5xx responses other than 501, up to three attempts in total.
      console.error(`Stripe registration sync failed for ${identityId}: ${(err as Error).message}`);
      res.status(502).json({ error: "sync_failed" });
    }
  },
);

app.listen(PORT, () => {
  console.log(`Stripe webhook listening on port ${PORT}`);
});
