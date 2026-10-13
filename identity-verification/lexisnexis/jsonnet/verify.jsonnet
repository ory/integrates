// Body for the post-registration Ory Action that calls LexisNexis InstantID.
// It runs before the identity is saved, so it sends no identity ID. Extend the
// identity schema with ssn/phone_number/address fields if your registration
// form collects them.
function(ctx)
  local traits = std.get(ctx.identity, 'traits', {});
  local name = std.get(traits, 'name', {});
  {
    metadata_public: std.get(ctx.identity, 'metadata_public', null),
    first_name: if name == null then '' else std.get(name, 'first', ''),
    last_name: if name == null then '' else std.get(name, 'last', ''),
    address: std.get(traits, 'address', {}),
    date_of_birth: std.get(traits, 'date_of_birth', null),
    ssn: std.get(traits, 'ssn', null),
    phone_number: std.get(traits, 'phone_number', null),
  }
