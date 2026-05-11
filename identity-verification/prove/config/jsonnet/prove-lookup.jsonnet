function(ctx) {
  flow_id: ctx.flow.id,
  phone_number: if std.objectHas(ctx.flow, 'transient_payload') && std.objectHas(ctx.flow.transient_payload, 'phone_number') then ctx.flow.transient_payload.phone_number else '',
  request_id: ctx.flow.id + '-' + std.toString(ctx.flow.issued_at)
}
