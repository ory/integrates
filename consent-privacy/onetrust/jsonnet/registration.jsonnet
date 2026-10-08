// Body for both OneTrust registration actions. The client passes consent
// choices in the registration flow's transient_payload:
//
//   { "transient_payload": { "consent": { "marketing": true, "analytics": false } } }
//
// Jsonnet fails on a missing field, and a failing template fails the user's
// registration for the response.parse action, so every optional field is read
// with std.get.
function(ctx)
  local payload = std.get(ctx.flow, 'transient_payload', null);
  local consent = if payload == null then null else std.get(payload, 'consent', null);
  local metadataPublic = std.get(ctx.identity, 'metadata_public', null);
  {
    identity: {
      id: ctx.identity.id,
      email: std.get(ctx.identity.traits, 'email', null),
      metadata_public: if metadataPublic == null then {} else metadataPublic,
    },
    consent: if std.isObject(consent) then consent else null,
  }
