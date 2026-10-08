// Body for the post-login Ory Action that reads the stored Persona
// verification status and blocks login when it's "declined". The webhook
// payload has no metadata_admin, so the status lives in metadata_public.
function(ctx)
  local metadata = std.get(ctx.identity, 'metadata_public', null);
  {
    persona_verification_status:
      if metadata == null then null else std.get(metadata, 'persona_verification_status', null),
  }
