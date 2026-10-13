// Body for the Segment Ory Actions (registration, login, settings). The
// handler selects the Segment call by endpoint path.
function(ctx) {
  identity: {
    id: ctx.identity.id,
    traits: ctx.identity.traits,
    created_at: std.get(ctx.identity, 'created_at', null),
  },
  flow: {
    id: ctx.flow.id,
    type: ctx.flow.type,
  },
  client_ip: std.get(ctx.request_headers, 'True-Client-Ip', [null])[0],
  user_agent: std.get(ctx.request_headers, 'User-Agent', [null])[0],
}
