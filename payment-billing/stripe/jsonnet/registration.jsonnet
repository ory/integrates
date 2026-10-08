// Body for the asynchronous post-registration Ory Action. It runs after the
// identity is saved, so ctx.identity.id is the stable identity ID.
function(ctx) {
  identity_id: ctx.identity.id,
  email: std.get(ctx.identity.traits, 'email', null),
}
