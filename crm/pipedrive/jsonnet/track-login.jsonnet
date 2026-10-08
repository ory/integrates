// Body for the async post-login Ory Action that logs a login activity on
// the corresponding Pipedrive person. Login actions always receive ctx.session.
function(ctx)
  local header(name) = std.get(ctx.request_headers, name, [null])[0];
  {
    id: ctx.identity.id,
    traits: ctx.identity.traits,
    login_time: std.get(ctx.session, 'authenticated_at', null),
    ip_address: header('True-Client-Ip'),
    user_agent: header('User-Agent'),
    login_method: std.join(',', [m.method for m in std.get(ctx.session, 'authentication_methods', [])]),
    session_id: ctx.session.id,
  }
