// Body for the Svix Ory Actions (registration, login, settings, recovery,
// verification). The handler selects the Svix event type by endpoint path.
// The webhook context never contains metadata_admin.
function(ctx) {
  identity: {
    id: ctx.identity.id,
    traits: ctx.identity.traits,
    metadata_public: std.get(ctx.identity, 'metadata_public', null),
  },
  flow: {
    id: ctx.flow.id,
    type: ctx.flow.type,
  },
  client_ip: std.get(ctx.request_headers, 'True-Client-Ip', [null])[0],
}
