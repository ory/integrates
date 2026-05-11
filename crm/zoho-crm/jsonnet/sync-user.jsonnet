// Body for the Ory Action that syncs the identity into Zoho CRM Contacts.
function(ctx) {
  identity: {
    id: ctx.identity.id,
    traits: ctx.identity.traits,
  },
}
