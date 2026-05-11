// Body for the sync post-registration Ory Action that calls the OneTrust
// webhook handler. The client must pass consent choices via transient_payload:
//
//   { "transient_payload": { "consent": { "marketing": true, "analytics": false } } }
//
// The handler returns updated metadata_public.consent so Ory records the
// choices on the new identity even if OneTrust is unreachable.
function(ctx) {
  identity: {
    id: ctx.identity.id,
    traits: ctx.identity.traits,
    metadata_public: ctx.identity.metadata_public,
  },
  flow: {
    id: ctx.flow.id,
    type: ctx.flow.type,
    transient_payload: ctx.flow.transient_payload,
  },
}
