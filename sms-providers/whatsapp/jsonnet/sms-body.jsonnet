// Body template Kratos passes to the WhatsApp courier handler.
//
// Kratos's HTTP courier renders this jsonnet against its message context (recipient,
// rendered body text, message_type, etc.). The handler at /whatsapp/send extracts the
// OTP from `body` and maps it into the WhatsApp Cloud API template payload.
function(ctx) {
  recipient: ctx.recipient,
  body: ctx.body,
  message_type: if std.objectHas(ctx, "message_type") then ctx.message_type else "verification_code",
}
