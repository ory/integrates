// Body for the post-registration Ory Action that calls the Castle webhook handler.
// Same payload shape as login — Castle distinguishes events by handler endpoint.
function(ctx) {
  identity: {
    id: ctx.identity.id,
    traits: ctx.identity.traits,
    metadata_admin: ctx.identity.metadata_admin,
    created_at: ctx.identity.created_at,
  },
  flow: {
    id: ctx.flow.id,
    type: ctx.flow.type,
    transient_payload: if std.objectHas(ctx.flow, "transient_payload") then ctx.flow.transient_payload else {},
  },
  request_headers: ctx.request_headers,
  request_url: ctx.request_url,
}
