function(ctx) {
  kratos_identity_id: ctx.identity.id,
  phone_number: ctx.identity.traits.phone_number,
  prove_identity_id: if ctx.identity.metadata_public != null && std.objectHas(ctx.identity.metadata_public, 'prove_identity_id')
                     then ctx.identity.metadata_public.prove_identity_id
                     else null,
  prove_id: if ctx.identity.metadata_public != null && std.objectHas(ctx.identity.metadata_public, 'prove_id')
            then ctx.identity.metadata_public.prove_id
            else null,
  last_login: ctx.flow.issued_at,
  flow_type: 'post_login_validation'
}
