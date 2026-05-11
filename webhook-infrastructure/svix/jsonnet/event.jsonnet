// Body for the async Svix router Ory Action hooks (registration, login,
// settings, recovery, verification). The handler distinguishes events by
// endpoint path; this single body shape is used for all five.
function(ctx) {
  identity: {
    id: ctx.identity.id,
    traits: ctx.identity.traits,
    metadata_public: ctx.identity.metadata_public,
    metadata_admin: ctx.identity.metadata_admin,
  },
  flow: {
    id: ctx.flow.id,
    type: ctx.flow.type,
  },
  request_headers: ctx.request_headers,
  request_url: ctx.request_url,
}
