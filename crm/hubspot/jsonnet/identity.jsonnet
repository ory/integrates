function(ctx)
  local traits = ctx.identity.traits;
  local name = std.get(traits, 'name', null);
  local nameFields = if std.isObject(name) then name else {};
  {
    identity_id: ctx.identity.id,
    email: std.get(traits, 'email', null),
    first_name: std.get(nameFields, 'first', null),
    last_name: std.get(nameFields, 'last', null),
    created_at: ctx.identity.created_at,
  }
