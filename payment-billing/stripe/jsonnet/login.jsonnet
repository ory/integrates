// Body for the sync post-login Ory Action that calls the Stripe webhook
// handler. The handler reads metadata_admin.stripe_customer_id (written by
// the post-registration hook) and rewrites metadata_public.billing with the
// current subscription status, plan, and current_period_end.
function(ctx) {
  identity: {
    id: ctx.identity.id,
    traits: ctx.identity.traits,
    metadata_admin: ctx.identity.metadata_admin,
    metadata_public: ctx.identity.metadata_public,
  },
  flow: {
    id: ctx.flow.id,
    type: ctx.flow.type,
  },
}
