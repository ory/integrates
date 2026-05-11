function(ctx) {
  kratos_identity_id: ctx.identity.id,
  persona_inquiry_id: if ctx.identity.metadata_public != null && std.objectHas(ctx.identity.metadata_public, 'persona_inquiry_id')
                      then ctx.identity.metadata_public.persona_inquiry_id
                      else null,
  persona_verification_status: if ctx.identity.metadata_public != null && std.objectHas(ctx.identity.metadata_public, 'persona_verification_status')
                                then ctx.identity.metadata_public.persona_verification_status
                                else null
}
