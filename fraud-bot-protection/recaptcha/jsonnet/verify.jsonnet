// Body for the sync after-flow Ory Action that calls the reCAPTCHA webhook
// handler. The client must pass the token via transient_payload:
//
//   { "transient_payload": { "recaptcha_token": "03AGdBq26..." } }
//
// transient_payload is omitted from the context when the client sends no
// payload, so the guard below hands the handler an empty object rather than
// failing the flow with a jsonnet error.
function(ctx) {
  flow: {
    id: ctx.flow.id,
    type: ctx.flow.type,
    transient_payload: if std.objectHas(ctx.flow, "transient_payload") then ctx.flow.transient_payload else {},
  },
  identity: if std.objectHas(ctx, "identity") then {
    id: ctx.identity.id,
    traits: ctx.identity.traits,
  } else null,
  request_headers: ctx.request_headers,
  request_url: ctx.request_url,
}
