// Body for the post-login Ory Action that reads the stored Onfido
// verification status and blocks login when it's "declined".
function(ctx)
  local metadata = std.get(ctx.identity, 'metadata_public', null);
  {
    kratos_identity_id: ctx.identity.id,
    onfido_verification_status:
      if metadata == null then null else std.get(metadata, 'onfido_verification_status', null),
  }
