function(ctx) {
  identity_id: ctx.identity.id,
  // The user must already be enrolled in Okta Verify; identity.traits.okta_user_id
  // holds the Okta user ID that owns the factor.
  okta_user_id: if std.objectHas(ctx.identity.traits, "okta_user_id") then ctx.identity.traits.okta_user_id else null,
}
