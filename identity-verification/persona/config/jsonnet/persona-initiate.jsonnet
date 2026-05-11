function(ctx) {
  kratos_identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  first_name: if std.objectHas(ctx.identity.traits, 'first_name') then ctx.identity.traits.first_name else '',
  last_name: if std.objectHas(ctx.identity.traits, 'last_name') then ctx.identity.traits.last_name else ''
}
