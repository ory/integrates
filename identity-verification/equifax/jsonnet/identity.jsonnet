// The identity is not saved yet, so ctx.identity.id is the nil UUID. Send
// only values the user submitted.
function(ctx)
  local traits = std.get(ctx.identity, 'traits', {});
  local name = std.get(traits, 'name', null);
  {
    email: std.get(traits, 'email', null),
    first_name: if name == null then null else std.get(name, 'first', null),
    last_name: if name == null then null else std.get(name, 'last', null),
    date_of_birth: std.get(traits, 'date_of_birth', null),
    ssn_last_four: std.get(traits, 'ssn_last_four', null),
    address: std.get(traits, 'address', null),
  }
