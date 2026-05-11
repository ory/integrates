// Body for the pre-registration Ory Action that pre-fills identity traits
// from Prove's phone-anchored identity graph. Run as a `before:` hook on the
// registration flow with response.parse: true so Ory absorbs the prefill.
function(ctx) {
  phone_number:
    if std.objectHas(ctx, "flow") && std.objectHas(ctx.flow, "transient_payload")
       && ctx.flow.transient_payload != null
       && std.objectHas(ctx.flow.transient_payload, "phone_number")
    then ctx.flow.transient_payload.phone_number
    else if std.objectHas(ctx.identity.traits, "phone_number")
    then ctx.identity.traits.phone_number
    else "",
}
