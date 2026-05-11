// Body for the sync post-registration Ory Action that calls the Stripe
// webhook handler. The handler reads identity.id, identity.traits.email, and
// identity.traits.name and returns updated metadata_admin.stripe_customer_id
// + metadata_public.billing.
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
