// Body for the sync pre-flow Ory Action that calls the reCAPTCHA webhook
// handler. The client must pass the token via transient_payload:
//
//   { "transient_payload": { "recaptcha_token": "03AGdBq26..." } }
function(ctx) {
  flow: {
    id: ctx.flow.id,
    type: ctx.flow.type,
    transient_payload: ctx.flow.transient_payload,
  },
  identity: if std.objectHas(ctx, "identity") then {
    id: ctx.identity.id,
    traits: ctx.identity.traits,
  } else null,
  request_headers: ctx.request_headers,
  request_url: ctx.request_url,
}
