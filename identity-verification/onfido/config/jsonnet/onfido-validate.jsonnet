function(ctx) {
  kratos_identity_id: ctx.identity.id,
  onfido_verification_status: if ctx.identity.metadata_public != null && std.objectHas(ctx.identity.metadata_public, 'onfido_verification_status')
                               then ctx.identity.metadata_public.onfido_verification_status
                               else null,
  onfido_workflow_run_id: if ctx.identity.metadata_public != null && std.objectHas(ctx.identity.metadata_public, 'onfido_workflow_run_id')
                           then ctx.identity.metadata_public.onfido_workflow_run_id
                           else null
}
