function(ctx) {
  flow: {
    id: ctx.flow.id,
    type: ctx.flow.type,
    transient_payload: ctx.flow.transient_payload,
  },
  identity: if std.objectHas(ctx, "identity") then {
    id: ctx.identity.id,
    traits: ctx.identity.traits,
  } else null,
  request_headers: ctx.request_headers,
  request_url: ctx.request_url,
}
