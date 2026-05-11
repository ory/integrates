// Body for the sync post-login Ory Action that checks Jumio verification
// status before issuing a session.
function(ctx) {
  kratos_identity_id: ctx.identity.id,
  jumio_account_id:
    if ctx.identity.metadata_public != null && std.objectHas(ctx.identity.metadata_public, "jumio_account_id")
    then ctx.identity.metadata_public.jumio_account_id
    else null,
  jumio_verification_status:
    if ctx.identity.metadata_public != null && std.objectHas(ctx.identity.metadata_public, "jumio_verification_status")
    then ctx.identity.metadata_public.jumio_verification_status
    else null,
}
