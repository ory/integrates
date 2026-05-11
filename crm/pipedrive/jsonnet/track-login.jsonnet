// Body for the async post-login Ory Action that logs a login activity on
// the corresponding Pipedrive person.
function(ctx) {
  id: ctx.identity.id,
  traits: ctx.identity.traits,
  login_time: if std.objectHas(ctx, "session") then ctx.session.authenticated_at else null,
  ip_address:
    if std.objectHas(ctx, "request_headers") && std.objectHas(ctx.request_headers, "True-Client-Ip")
    then ctx.request_headers["True-Client-Ip"][0]
    else if std.objectHas(ctx, "request_headers") && std.objectHas(ctx.request_headers, "x-forwarded-for")
    then ctx.request_headers["x-forwarded-for"][0]
    else null,
  user_agent:
    if std.objectHas(ctx, "request_headers") && std.objectHas(ctx.request_headers, "User-Agent")
    then ctx.request_headers["User-Agent"][0]
    else null,
  login_method:
    if std.objectHas(ctx, "session") && std.objectHas(ctx.session, "authentication_methods")
    then std.toString(ctx.session.authentication_methods)
    else null,
  session_id: if std.objectHas(ctx, "session") then ctx.session.id else null,
}
