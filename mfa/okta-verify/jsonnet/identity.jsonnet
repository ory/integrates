// The login UI sends the Okta Verify code in the flow's transient_payload under
// `okta_pass_code`. metadata_public is null until something writes to it.
function(ctx)
  local metadata = std.get(ctx.identity, 'metadata_public', null);
  local payload = std.get(ctx.flow, 'transient_payload', null);
  {
    identity_id: ctx.identity.id,
    okta_user_id: if metadata == null then null else std.get(metadata, 'okta_user_id', null),
    pass_code: if payload == null then null else std.get(payload, 'okta_pass_code', null),
  }
