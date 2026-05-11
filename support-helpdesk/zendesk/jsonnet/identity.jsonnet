// Body for the Zendesk user-sync hooks (registration and settings flows).
// The handler reads identity.id, identity.traits.email, identity.traits.name,
// plus optional metadata_public.billing and metadata_public.risk_assessment to
// populate Zendesk user_fields. The hook is async (response.ignore: true).
function(ctx) {
  identity: {
    id: ctx.identity.id,
    traits: ctx.identity.traits,
    metadata_public: ctx.identity.metadata_public,
  },
  flow: {
    id: ctx.flow.id,
    type: ctx.flow.type,
  },
}
