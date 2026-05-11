function(ctx) {
  identity_id: ctx.identity.id,
  // Duo identifies users by username, not email — you must enroll the user in Duo
  // ahead of time and put the matching username in identity.traits.duo_username.
  duo_username: if std.objectHas(ctx.identity.traits, "duo_username") then ctx.identity.traits.duo_username else ctx.identity.traits.email,
  client_ip: ctx.request_headers["X-Forwarded-For"][0],
}
