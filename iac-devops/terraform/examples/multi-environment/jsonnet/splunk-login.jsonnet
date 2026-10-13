// Body for the Splunk Ory Actions (registration, login, recovery, settings).
// The handler selects the event signature by endpoint path. Only login and
// settings actions carry a session.
function(ctx)
  local session = std.get(ctx, 'session', null);
  local methods = if session == null then null else std.get(session, 'authentication_methods', null);
  {
    identity: {
      id: ctx.identity.id,
      traits: ctx.identity.traits,
    },
    flow: {
      id: ctx.flow.id,
      type: ctx.flow.type,
    },
    authentication_methods: if methods == null then [] else [m.method for m in methods],
    client_ip: std.get(ctx.request_headers, 'True-Client-Ip', [null])[0],
    user_agent: std.get(ctx.request_headers, 'User-Agent', [null])[0],
  }
