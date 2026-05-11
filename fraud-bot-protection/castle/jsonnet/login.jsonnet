// Body for the post-login Ory Action that calls the Castle webhook handler.
// The handler enriches this and forwards to Castle's Risk API.
function(ctx) {
  identity: {
    id: ctx.identity.id,
    traits: ctx.identity.traits,
    metadata_public: ctx.identity.metadata_public,
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
