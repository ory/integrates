function(ctx) {
  kratos_identity_id: ctx.identity.id,
  first_name: ctx.identity.traits.first_name,
  last_name: ctx.identity.traits.last_name,
  email: ctx.identity.traits.email,
  date_of_birth: if std.objectHas(ctx.identity.traits, 'date_of_birth') then ctx.identity.traits.date_of_birth else null
}
