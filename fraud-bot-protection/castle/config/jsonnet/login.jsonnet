function(ctx) {
  identity: {
    id: ctx.identity.id,
    traits: ctx.identity.traits,
    metadata_public: ctx.identity.metadata_public,
    metadata_admin: ctx.identity.metadata_admin,
    created_at: ctx.identity.created_at,
  },
  flow: {
    id: ctx.flow.id,
    type: ctx.flow.type,
    transient_payload: ctx.flow.transient_payload,
  },
  request_headers: ctx.request_headers,
  request_url: ctx.request_url,
}
