// Body for the async Segment Ory Action hooks (registration, login,
// settings). The handler distinguishes events by endpoint path; this single
// body shape is used for all three.
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
  },
  request_headers: ctx.request_headers,
  request_url: ctx.request_url,
}
