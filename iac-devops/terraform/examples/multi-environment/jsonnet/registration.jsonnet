function(ctx) {
  identity_id: ctx.identity.id,
  email: std.get(ctx.identity.traits, 'email', null),
}
