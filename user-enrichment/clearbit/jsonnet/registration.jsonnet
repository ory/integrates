// Body for the async post-registration Ory Action that calls the Clearbit
// webhook handler. The handler reads identity.id and identity.traits.email,
// enriches via Clearbit, and writes the result to metadata_admin via the
// Ory Admin API. The webhook context never contains metadata_admin.
function(ctx) {
  identity: {
    id: ctx.identity.id,
    traits: { email: std.get(ctx.identity.traits, 'email', null) },
  },
  flow: {
    id: ctx.flow.id,
    type: ctx.flow.type,
  },
}
