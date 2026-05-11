function(ctx) {
  kratos_identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  first_name: ctx.identity.traits.first_name,
  last_name: ctx.identity.traits.last_name,
  address: if std.objectHas(ctx.identity.traits, 'address') then ctx.identity.traits.address else {},
  date_of_birth: if std.objectHas(ctx.identity.traits, 'date_of_birth') then ctx.identity.traits.date_of_birth else '',
  ssn: if std.objectHas(ctx.identity.traits, 'ssn') then ctx.identity.traits.ssn else '',
  phone_number: if std.objectHas(ctx.identity.traits, 'phone_number') then ctx.identity.traits.phone_number else ''
}
