// Body template Kratos passes to the WhatsApp courier handler.
//
// The code is in template_data.login_code, registration_code, or
// verification_code depending on the template; the recovery SMS also uses
// verification_code. The handler falls back to extracting the code from the
// rendered body when `otp` is null.
function(ctx)
  local data = std.get(ctx, 'template_data', null);
  local field(name) = if data == null then null else std.get(data, name, null);
  {
    recipient: ctx.recipient,
    body: ctx.body,
    otp: std.foldl(
      function(found, name) if found != null then found else field(name),
      ['login_code', 'registration_code', 'verification_code'],
      null,
    ),
    template_type: std.get(ctx, 'template_type', null),
    message_type: std.get(ctx, 'message_type', null),
  }
