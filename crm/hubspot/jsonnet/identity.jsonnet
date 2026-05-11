function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  first_name: if std.objectHas(ctx.identity.traits, "name") then ctx.identity.traits.name.first else null,
  last_name: if std.objectHas(ctx.identity.traits, "name") then ctx.identity.traits.name.last else null,
  created_at: ctx.identity.created_at,
}
