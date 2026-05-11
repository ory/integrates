// Body for the post-registration Ory Action that enrolls the user's phone
// in Prove's Identity Manager.
function(ctx) {
  kratos_identity_id: ctx.identity.id,
  phone_number: if std.objectHas(ctx.identity.traits, "phone_number") then ctx.identity.traits.phone_number else "",
}
