// Default body template: forward the identity payload to your webhook handler.
// Override this file when your handler needs a different shape.
function(ctx) {
  identity_id: ctx.identity.id,
  email: ctx.identity.traits.email,
  traits: ctx.identity.traits,
  created_at: ctx.identity.created_at,
}
