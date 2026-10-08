// Body for the post-login Ory Action that checks the stored Jumio
// verification status before Ory issues a session.
function(ctx)
  local metadata = std.get(ctx.identity, 'metadata_public', null);
  {
    kratos_identity_id: ctx.identity.id,
    jumio_account_id: if metadata == null then null else std.get(metadata, 'jumio_account_id', null),
    jumio_verification_status: if metadata == null then null else std.get(metadata, 'jumio_verification_status', null),
  }
