function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  first_name: if std.objectHas(ctx.identity.traits, "name") then ctx.identity.traits.name.first else null,
  last_name: if std.objectHas(ctx.identity.traits, "name") then ctx.identity.traits.name.last else null,
  date_of_birth: if std.objectHas(ctx.identity.traits, "date_of_birth") then ctx.identity.traits.date_of_birth else null,
  ssn_last_four: if std.objectHas(ctx.identity.traits, "ssn_last_four") then ctx.identity.traits.ssn_last_four else null,
  address: if std.objectHas(ctx.identity.traits, "address") then ctx.identity.traits.address else null,
}
