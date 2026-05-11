// Body for the async Splunk Ory Action hooks (registration, login, recovery,
// settings). The handler distinguishes flows by endpoint path; this single
// body shape is used for all four.
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
