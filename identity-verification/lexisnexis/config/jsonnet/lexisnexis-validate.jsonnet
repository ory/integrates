function(ctx) {
  kratos_identity_id: ctx.identity.id,
  lexisnexis_verification_status: if ctx.identity.metadata_public != null && std.objectHas(ctx.identity.metadata_public, 'lexisnexis_verification_status')
                                   then ctx.identity.metadata_public.lexisnexis_verification_status
                                   else null,
  lexisnexis_cvi_score: if ctx.identity.metadata_public != null && std.objectHas(ctx.identity.metadata_public, 'lexisnexis_cvi_score')
                         then ctx.identity.metadata_public.lexisnexis_cvi_score
                         else 0
}
