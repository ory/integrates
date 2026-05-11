// Body for the async post-registration Ory Action that calls the Clearbit
// webhook handler. The handler reads identity.id and identity.traits.email,
// enriches via Clearbit, and writes the result to metadata_admin via the
// Ory Admin API. No response is consumed (response.ignore: true).
function(ctx) {
  identity: {
    id: ctx.identity.id,
    traits: ctx.identity.traits,
    metadata_admin: ctx.identity.metadata_admin,
  },
  flow: {
    id: ctx.flow.id,
    type: ctx.flow.type,
  },
}
