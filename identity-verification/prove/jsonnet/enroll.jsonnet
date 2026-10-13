// Body for the post-registration Ory Action that enrolls the user's phone
// in Prove's Identity Manager. The action runs after the identity is saved,
// so ctx.identity.id is the real ID.
function(ctx) {
  kratos_identity_id: ctx.identity.id,
  phone_number: std.get(std.get(ctx.identity, 'traits', {}), 'phone_number', ''),
}
