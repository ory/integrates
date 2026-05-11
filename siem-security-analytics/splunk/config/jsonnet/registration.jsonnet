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
  request_headers: ctx.request_headers,
  request_url: ctx.request_url,
  request_method: ctx.request_method,
}
