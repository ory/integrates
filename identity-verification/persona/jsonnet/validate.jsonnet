// Body for the sync post-login Ory Action that reads stored Persona
// verification status and blocks login when it's "declined".
function(ctx) {
  kratos_identity_id: ctx.identity.id,
  persona_inquiry_id:
    if ctx.identity.metadata_admin != null && std.objectHas(ctx.identity.metadata_admin, "persona_inquiry_id")
    then ctx.identity.metadata_admin.persona_inquiry_id else null,
  persona_verification_status:
    if ctx.identity.metadata_admin != null && std.objectHas(ctx.identity.metadata_admin, "persona_verification_status")
    then ctx.identity.metadata_admin.persona_verification_status else null,
}
