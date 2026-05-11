// Body for the async post-registration / post-settings Ory Action that
// upserts a Pipedrive person.
function(ctx) {
  id: ctx.identity.id,
  traits: ctx.identity.traits,
  created_at: ctx.identity.created_at,
}
