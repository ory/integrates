// Body for the post-login Ory Action that validates the stored phone
// against what Prove has on file. The webhook payload has no metadata_admin,
// so prove_identity_id lives in metadata_public.
function(ctx)
  local metadata = std.get(ctx.identity, 'metadata_public', null);
  {
    phone_number: std.get(std.get(ctx.identity, 'traits', {}), 'phone_number', ''),
    prove_identity_id: if metadata == null then null else std.get(metadata, 'prove_identity_id', null),
  }
