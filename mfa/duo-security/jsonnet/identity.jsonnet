// The login UI sends the Duo passcode in the flow's transient_payload under
// `duo_passcode`. Ory Network sets the client IP in the True-Client-Ip header.
function(ctx)
  local payload = std.get(ctx.flow, 'transient_payload', null);
  {
    username: ctx.identity.id,
    passcode: if payload == null then null else std.get(payload, 'duo_passcode', null),
    ipaddr: std.get(ctx.request_headers, 'True-Client-Ip', [null])[0],
  }
