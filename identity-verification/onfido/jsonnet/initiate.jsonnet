// Body for the sync post-registration Ory Action that starts an Onfido workflow.
function(ctx) {
  kratos_identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  first_name: if std.objectHas(ctx.identity.traits, "name") && std.objectHas(ctx.identity.traits.name, "first")
              then ctx.identity.traits.name.first else "",
  last_name:  if std.objectHas(ctx.identity.traits, "name") && std.objectHas(ctx.identity.traits.name, "last")
              then ctx.identity.traits.name.last else "",
  date_of_birth: if std.objectHas(ctx.identity.traits, "date_of_birth") then ctx.identity.traits.date_of_birth else null,
}
