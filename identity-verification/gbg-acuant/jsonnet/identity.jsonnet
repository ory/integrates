function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  first_name: if std.objectHas(ctx.identity.traits, "name") then ctx.identity.traits.name.first else null,
  last_name: if std.objectHas(ctx.identity.traits, "name") then ctx.identity.traits.name.last else null,
  date_of_birth: if std.objectHas(ctx.identity.traits, "date_of_birth") then ctx.identity.traits.date_of_birth else null,
  document_image: if std.objectHas(ctx.identity.traits, "document_image") then ctx.identity.traits.document_image else null,
  selfie_image: if std.objectHas(ctx.identity.traits, "selfie_image") then ctx.identity.traits.selfie_image else null,
}
