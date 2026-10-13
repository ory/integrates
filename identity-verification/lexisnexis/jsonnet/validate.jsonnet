// Body for the post-login Ory Action that reads the stored verification
// status and blocks login when it's "failed".
function(ctx)
  local metadata = std.get(ctx.identity, 'metadata_public', null);
  {
    lexisnexis_verification_status:
      if metadata == null then null else std.get(metadata, 'lexisnexis_verification_status', null),
  }
