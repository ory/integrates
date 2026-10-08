// Body for the post-registration Ory Action that starts a Jumio workflow.
// The action runs after the identity is saved, so ctx.identity.id is the real ID.
function(ctx)
  local traits = std.get(ctx.identity, 'traits', {});
  local name = std.get(traits, 'name', {});
  {
    kratos_identity_id: ctx.identity.id,
    email: std.get(traits, 'email', null),
    first_name: if name == null then '' else std.get(name, 'first', ''),
    last_name: if name == null then '' else std.get(name, 'last', ''),
  }
