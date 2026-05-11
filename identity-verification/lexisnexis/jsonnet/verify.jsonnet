// Body for the sync post-registration Ory Action that calls LexisNexis
// InstantID. Extend the identity schema with ssn/phone_number/address fields
// if your registration form collects them.
function(ctx) {
  kratos_identity_id: ctx.identity.id,
  first_name: if std.objectHas(ctx.identity.traits, "name") && std.objectHas(ctx.identity.traits.name, "first")
              then ctx.identity.traits.name.first
              else "",
  last_name:  if std.objectHas(ctx.identity.traits, "name") && std.objectHas(ctx.identity.traits.name, "last")
              then ctx.identity.traits.name.last
              else "",
  address: if std.objectHas(ctx.identity.traits, "address") then ctx.identity.traits.address else {},
  date_of_birth: if std.objectHas(ctx.identity.traits, "date_of_birth") then ctx.identity.traits.date_of_birth else null,
  ssn: if std.objectHas(ctx.identity.traits, "ssn") then ctx.identity.traits.ssn else null,
  phone_number: if std.objectHas(ctx.identity.traits, "phone_number") then ctx.identity.traits.phone_number else null,
}
