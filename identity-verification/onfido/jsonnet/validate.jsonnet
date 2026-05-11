// Body for the sync post-login Ory Action that reads the stored Onfido
// verification status and blocks login when it's "declined".
function(ctx) {
  kratos_identity_id: ctx.identity.id,
  onfido_verification_status:
    if ctx.identity.metadata_public != null && std.objectHas(ctx.identity.metadata_public, "onfido_verification_status")
    then ctx.identity.metadata_public.onfido_verification_status
    else null,
}
