// Default body template: forward the identity to your webhook handler.
// Override this file when your handler needs a different shape. Read optional
// fields with std.get: Jsonnet fails on a missing field, and Ory then drops
// the request. The webhook context never contains metadata_admin.
function(ctx) {
  identity: {
    id: ctx.identity.id,
    traits: ctx.identity.traits,
    created_at: ctx.identity.created_at,
  },
  client_ip: std.get(ctx.request_headers, 'True-Client-Ip', [null])[0],
}
