# Stripe

> **Maintained by:** Community contributors

[Stripe](https://stripe.com) customer and subscription sync for Ory Network. When a user registers, the handler creates a Stripe Customer linked to the Ory identity. Stripe webhooks then keep the subscription state on the identity's `metadata_public.stripe`, so your application can gate features by plan without calling Stripe.

**Type:** webhook (Ory Action and Stripe webhook — code in [`webhook/`](./webhook/))
**Docs page:** [ory.com/docs/integrates-with/payment-billing/stripe](https://www.ory.com/docs/integrates-with/payment-billing/stripe)

## Endpoints

| Path | Trigger | Auth | Purpose |
| --- | --- | --- | --- |
| `POST /stripe/registration` | Asynchronous Ory Action in the registration method lists | `X-Webhook-Secret` | Creates a Stripe Customer with `metadata.ory_identity_id` and the idempotency key `ory-customer-<identity id>`, then writes `metadata_public.stripe.customer_id` with `PATCH /admin/identities/{id}`. |
| `POST /stripe/webhook` | Stripe `customer.subscription.created`, `.updated`, `.deleted` | `Stripe-Signature` | Resolves the identity from the Customer's `metadata.ory_identity_id` and writes `subscription_state`, `plan`, and `current_period_end` under `metadata_public.stripe`. |

After a full sync, the identity carries:

```json
{
  "metadata_public": {
    "stripe": {
      "customer_id": "cus_...",
      "subscription_id": "sub_...",
      "subscription_state": "active",
      "plan": "pro_monthly",
      "current_period_end": "2026-11-01T00:00:00.000Z",
      "synced_at": "2026-09-21T12:00:00.000Z"
    }
  }
}
```

`plan` is the price's `lookup_key`, or the price ID when the price has no lookup key.

## Required env vars

```
ORY_WEBHOOK_SECRET        X-Webhook-Secret header value Ory sends
ORY_SDK_URL               Ory project URL, for example https://<project-slug>.projects.oryapis.com
ORY_ADMIN_API_KEY         Ory project API key for the Admin API
STRIPE_SECRET_KEY         Stripe secret key
STRIPE_WEBHOOK_SECRET     Signing secret of the Stripe webhook endpoint (whsec_...)
STRIPE_API_VERSION        default: 2025-02-24.acacia
PORT                      default: 3000
```

## Run

```bash
cd webhook/
cp .env.example .env
npm install
npm start              # runs `tsx server.ts`
```

## Configure Ory

1. Encode the body template: `base64 < jsonnet/registration.jsonnet | tr -d '\n'`.
2. Add the hook from [`ory-actions.yaml`](./ory-actions.yaml) to `selfservice.flows.registration.after.password.hooks`, and to the list of every other sign-up method you enable, such as `oidc`, `code`, or `passkey`. The flow-level `registration.after.hooks` list doesn't run for methods that have their own hooks. Keep `session` last in each list. See [Attach `after` actions to authentication methods](https://www.ory.com/docs/kratos/hooks/configure-hooks#attach-after-actions-to-authentication-methods).
3. Keep `response.ignore: true`. The action runs after the identity is saved, so `ctx.identity.id` is the stable identity ID, and Stripe availability never blocks registration. Don't use `response.parse`: in that mode the identity isn't saved yet and its ID is `00000000-0000-0000-0000-000000000000`.

## Configure Stripe

1. In the Stripe Dashboard, go to **Developers**, then **Webhooks**, and add an endpoint at `https://<your-handler>/stripe/webhook`.
2. Select `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
3. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

## Notes

- Ory retries a registration call that fails with `429` or a `5xx` status other than `501`, up to three attempts in total. The idempotency key makes those retries return the same Customer.
- Stripe delivers events at least once and out of order, and several events can share a timestamp. The handler treats each event as a trigger: it retrieves the subscription's current state from Stripe and writes that, one sync at a time per identity. The lock is in-process, so run one replica or replace it with a distributed lock or a per-customer queue.
- Keep subscription state current with Stripe webhooks, not with a login action. Identity changes that a login webhook returns apply only to that login and aren't saved.
- The webhook context doesn't contain `metadata_admin`, so the body template must not read it.
- Subscription gating belongs in your application: read `session.identity.metadata_public.stripe` from `/sessions/whoami`.

## License

Apache-2.0. SPDX header in each source file.
