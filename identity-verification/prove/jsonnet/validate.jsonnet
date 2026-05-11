// Body for the sync post-login Ory Action that validates the stored phone
// against what Prove has on file.
function(ctx) {
  kratos_identity_id: ctx.identity.id,
  phone_number: if std.objectHas(ctx.identity.traits, "phone_number") then ctx.identity.traits.phone_number else "",
  prove_identity_id:
    if ctx.identity.metadata_public != null && std.objectHas(ctx.identity.metadata_public, "prove_identity_id")
    then ctx.identity.metadata_public.prove_identity_id
    else null,
}
