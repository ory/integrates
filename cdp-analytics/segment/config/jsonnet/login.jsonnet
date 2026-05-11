function(ctx) {
  identity: {
    id: ctx.identity.id,
    traits: ctx.identity.traits,
  },
  flow: {
    id: ctx.flow.id,
    type: ctx.flow.type,
  },
  request_headers: ctx.request_headers,
  request_url: ctx.request_url,
}
