// Body for the registration.after action that calls the Castle handler. The client IP
// comes from the True-Client-Ip header, and the device token from the flow's
// transient_payload.
function(ctx)
  local payload = std.get(ctx.flow, 'transient_payload', null);
  {
    request_token: if payload == null then null else std.get(payload, 'castle_request_token', null),
    user: {
      id: ctx.identity.id,
      email: std.get(ctx.identity.traits, 'email', null),
      registered_at: std.get(ctx.identity, 'created_at', null),
    },
    ip: std.get(ctx.request_headers, 'True-Client-Ip', [null])[0],
    headers: ctx.request_headers,
  }
