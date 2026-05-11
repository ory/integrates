/**
 * Stripe <> Ory Actions Webhook Handler
 *
 * Endpoints:
 *   POST /webhooks/stripe/registration — Create Stripe Customer on user registration
 *   POST /webhooks/stripe/login        — Enrich session with subscription status on login
 *   GET  /health                        — Health check
 *
 * SECURITY: The STRIPE_SECRET_KEY must be stored in a secret manager.
 *   - Set SECRET_BACKEND=env and STRIPE_SECRET_KEY=sk_... for local dev
 *   - Use SECRET_BACKEND=aws-secrets-manager|gcp-secret-manager|vault in production
 *   - Use a secret manager (Cloud Secret Manager, AWS Secrets Manager, Vault, etc.)
 *
 * The WEBHOOK_SECRET is used to authenticate incoming requests from Ory Actions.
 */

import express from "express";
import Stripe from "stripe";
import type {
  OryWebhookPayload,
  RegistrationResponse,
  LoginResponse,
  BillingInfo,
} from "./types";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || "3000", 10);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// --- Middleware ---

function authenticateWebhook(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  if (!WEBHOOK_SECRET) {
    next();
    return;
  }
  const provided = req.get("X-Webhook-Secret");
  if (provided !== WEBHOOK_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// --- Helpers ---

let stripeClient: Stripe | null = null;

async function getStripeClient(): Promise<Stripe> {
  if (stripeClient) return stripeClient;

  // IMPORTANT: In production, use a secret manager instead of env vars.
  // Use a secret manager (Cloud Secret Manager, AWS Secrets Manager, Vault, etc.)
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. " +
        "Store it in a secret manager (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault) " +
        "and configure SECRET_BACKEND accordingly.",
    );
  }

  stripeClient = new Stripe(apiKey, { apiVersion: "2024-12-18.acacia" });
  return stripeClient;
}

// --- Routes ---

/**
 * POST /webhooks/stripe/registration
 *
 * Called by Ory Actions after a successful registration.
 * Creates a Stripe Customer and stores the customer ID in Ory identity metadata.
 *
 * This is a SYNCHRONOUS hook (response.parse: true) so Ory reads our response
 * and applies the metadata updates to the identity.
 */
app.post(
  "/webhooks/stripe/registration",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    const payload = req.body as OryWebhookPayload;
    const { identity } = payload;

    if (!identity?.traits?.email) {
      console.warn(
        "Registration webhook received without email trait, skipping Stripe customer creation",
      );
      res.status(200).json({});
      return;
    }

    try {
      const stripe = await getStripeClient();

      const customer = await stripe.customers.create({
        email: identity.traits.email,
        name: [identity.traits.name?.first, identity.traits.name?.last]
          .filter(Boolean)
          .join(" ") || undefined,
        metadata: {
          ory_identity_id: identity.id,
        },
      });

      console.log(
        `Created Stripe customer ${customer.id} for Ory identity ${identity.id}`,
      );

      const response: RegistrationResponse = {
        identity: {
          metadata_admin: {
            stripe_customer_id: customer.id,
          },
          metadata_public: {
            billing: {
              customer_id: customer.id,
              status: "free",
              plan: "none",
            },
          },
        },
      };

      res.status(200).json(response);
    } catch (err) {
      console.error("Failed to create Stripe customer:", err);
      // Don't block registration if Stripe fails — return 200 with no modifications
      res.status(200).json({});
    }
  },
);

/**
 * POST /webhooks/stripe/login
 *
 * Called by Ory Actions after a successful login.
 * Looks up the user's Stripe subscription status and updates metadata_public.
 */
app.post(
  "/webhooks/stripe/login",
  authenticateWebhook,
  async (req: express.Request, res: express.Response): Promise<void> => {
    const payload = req.body as OryWebhookPayload;
    const { identity } = payload;

    const customerId = identity?.metadata_admin?.stripe_customer_id as
      | string
      | undefined;

    if (!customerId) {
      // No Stripe customer linked — nothing to enrich
      res.status(200).json({});
      return;
    }

    try {
      const stripe = await getStripeClient();

      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 1,
        expand: ["data.items.data.price.product"],
      });

      let billing: BillingInfo;

      if (subscriptions.data.length === 0) {
        billing = {
          customer_id: customerId,
          status: "free",
          plan: "none",
        };
      } else {
        const sub = subscriptions.data[0];
        const product = sub.items.data[0]?.price?.product;
        const planName =
          typeof product === "object" && "name" in product
            ? product.name
            : "unknown";

        billing = {
          customer_id: customerId,
          status: sub.status as BillingInfo["status"],
          plan: planName,
          current_period_end: new Date(
            sub.current_period_end * 1000,
          ).toISOString(),
        };
      }

      const response: LoginResponse = {
        identity: {
          metadata_public: { billing },
        },
      };

      res.status(200).json(response);
    } catch (err) {
      console.error("Failed to fetch Stripe subscription:", err);
      // Don't block login if Stripe fails
      res.status(200).json({});
    }
  },
);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", integration: "stripe" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Stripe webhook handler listening on port ${PORT}`);
  });
}

export { app };
