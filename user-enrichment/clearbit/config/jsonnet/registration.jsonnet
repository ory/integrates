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
