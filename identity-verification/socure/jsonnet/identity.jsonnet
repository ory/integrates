// The identity is not saved yet, so ctx.identity.id is the nil UUID. Send
// only values the user submitted.
function(ctx)
  local traits = std.get(ctx.identity, 'traits', {});
  local name = std.get(traits, 'name', null);
  local payload = std.get(ctx.flow, 'transient_payload', null);
  {
    email: std.get(traits, 'email', null),
    first_name: if name == null then null else std.get(name, 'first', null),
    last_name: if name == null then null else std.get(name, 'last', null),
    date_of_birth: std.get(traits, 'date_of_birth', null),
    ssn: std.get(traits, 'ssn', null),
    address: std.get(traits, 'address', null),
    device_session_id:
      if payload != null && std.objectHas(payload, 'device_session_id')
      then payload.device_session_id
      else std.get(traits, 'socure_device_session_id', null),
  }
