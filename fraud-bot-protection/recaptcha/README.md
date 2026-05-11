# Google reCAPTCHA v2/v3 Integration with Ory Network

## Overview

Google reCAPTCHA is a CAPTCHA service that protects websites from spam and abuse. It offers two primary versions:

- **reCAPTCHA v2** — Presents users with a visible checkbox ("I'm not a robot") or an invisible challenge that triggers when suspicious activity is detected.
- **reCAPTCHA v3** — Runs entirely in the background and returns a risk score (0.0 to 1.0) without requiring any user interaction.

Both versions work by generating a client-side token that must be validated server-side against Google's `siteverify` API. This integration uses Ory Actions webhooks to perform that server-side validation before a registration or login flow completes.

## Integration Architecture

```
User Browser                    Ory Network                     Google reCAPTCHA
     |                               |                               |
     |  1. Load page with             |                               |
     |     reCAPTCHA widget           |                               |
     |<-------------------------------|                               |
     |                               |                               |
     |  2. User completes challenge   |                               |
     |     (v2) or score generated    |                               |
     |     (v3). Token returned.      |                               |
     |                               |                               |
     |  3. Submit form with           |                               |
     |     reCAPTCHA token in         |                               |
     |     transient_payload          |                               |
     |------------------------------->|                               |
     |                               |                               |
     |                               |  4. Pre-hook fires Ory Action  |
     |                               |     (webhook). Jsonnet builds  |
     |                               |     siteverify request.        |
     |                               |------------------------------->|
     |                               |                               |
     |                               |  5. Google responds with       |
     |                               |     success/failure + score    |
     |                               |<-------------------------------|
     |                               |                               |
     |                               |  6. If valid, flow continues.  |
     |                               |     If invalid, flow is        |
     |                               |     rejected with error.       |
     |                               |                               |
     |  7. Success or error           |                               |
     |<-------------------------------|                               |
```

## Ory Products

- **Ory Kratos (Identity)** — via Ory Actions (webhooks) as a pre-registration or pre-login hook.

## Prerequisites

1. **Google reCAPTCHA account** — Sign up at [https://www.google.com/recaptcha/admin](https://www.google.com/recaptcha/admin).
2. **Site key** — The public key embedded in your frontend HTML.
3. **Secret key** — The private key used for server-side verification. This will be stored in Ory Actions webhook configuration.
4. **Ory Network project** — An active Ory Network project with a custom UI (self-hosted or Ory Account Experience with custom domain).

## Configuration

### Ory Actions Webhook Setup

Configure a **pre-registration** (and optionally **pre-login**) webhook in your Ory Network project that calls Google's siteverify API.

Using the Ory CLI:

```bash
ory patch identity-config <project-id> \
  --replace '/selfservice/flows/registration/before/hooks=[
    {
      "hook": "web_hook",
      "config": {
        "url": "https://www.google.com/recaptcha/api/siteverify",
        "method": "POST",
        "body": "base64://YOUR_BASE64_ENCODED_JSONNET",
        "response": {
          "ignore": false,
          "parse": true
        },
        "auth": {
          "type": "api_key",
          "config": {
            "name": "Content-Type",
            "value": "application/x-www-form-urlencoded",
            "in": "header"
          }
        }
      }
    }
  ]'
```

### Jsonnet Template

The Jsonnet template extracts the reCAPTCHA token from `transient_payload` and constructs the verification request body.

```jsonnet
function(ctx)
{
  // Extract the reCAPTCHA token from the flow's transient_payload
  local recaptcha_token = ctx.flow.transient_payload.recaptcha_token,

  // Build the POST body for Google's siteverify endpoint
  body: "secret=YOUR_RECAPTCHA_SECRET_KEY&response=" + recaptcha_token,
}
```

> **Note:** Replace `YOUR_RECAPTCHA_SECRET_KEY` with your actual reCAPTCHA secret key. In production, consider using Ory's environment variable support or secrets management to avoid hardcoding the key.

## Technical Details

### Full Webhook Configuration (YAML)

```yaml
selfservice:
  flows:
    registration:
      before:
        hooks:
          - hook: web_hook
            config:
              url: "https://www.google.com/recaptcha/api/siteverify"
              method: POST
              body: "base64://<base64-encoded-jsonnet>"
              can_interrupt: true
              response:
                ignore: false
                parse: true
              auth:
                type: api_key
                config:
                  name: Content-Type
                  value: application/x-www-form-urlencoded
                  in: header
    login:
      before:
        hooks:
          - hook: web_hook
            config:
              url: "https://www.google.com/recaptcha/api/siteverify"
              method: POST
              body: "base64://<base64-encoded-jsonnet>"
              can_interrupt: true
              response:
                ignore: false
                parse: true
              auth:
                type: api_key
                config:
                  name: Content-Type
                  value: application/x-www-form-urlencoded
                  in: header
```

### Jsonnet Template (Full)

```jsonnet
function(ctx)
{
  // Extract the reCAPTCHA response token passed from the client
  local recaptcha_token = ctx.flow.transient_payload.recaptcha_token,

  // Construct the request body for Google's siteverify API
  // Format: application/x-www-form-urlencoded
  body: "secret=YOUR_RECAPTCHA_SECRET_KEY&response=" + recaptcha_token
        + "&remoteip=" + ctx.request_headers["X-Forwarded-For"][0],

  // Cancel the flow if verification fails
  // The webhook response parser checks for { "success": true }
  // If success is false, the flow is interrupted.
}
```

### Google siteverify Request

```
POST https://www.google.com/recaptcha/api/siteverify
Content-Type: application/x-www-form-urlencoded

secret=YOUR_SECRET_KEY&response=RECAPTCHA_TOKEN&remoteip=USER_IP
```

### Google siteverify Response

**Successful verification (v2):**

```json
{
  "success": true,
  "challenge_ts": "2024-01-15T12:00:00Z",
  "hostname": "your-app.example.com"
}
```

**Successful verification (v3):**

```json
{
  "success": true,
  "score": 0.9,
  "action": "login",
  "challenge_ts": "2024-01-15T12:00:00Z",
  "hostname": "your-app.example.com"
}
```

**Failed verification:**

```json
{
  "success": false,
  "error-codes": ["timeout-or-duplicate"]
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `missing-input-secret` | The secret parameter is missing |
| `invalid-input-secret` | The secret parameter is invalid |
| `missing-input-response` | The response parameter is missing |
| `invalid-input-response` | The response parameter is invalid or malformed |
| `bad-request` | The request is invalid or malformed |
| `timeout-or-duplicate` | The response is no longer valid (expired or already used) |

## Flow Integration

### Recommended Flows to Protect

| Flow | Priority | Hook Type | Notes |
|------|----------|-----------|-------|
| Registration | High | `before` (pre-registration) | Primary defense against bot signups |
| Login | Medium | `before` (pre-login) | Prevents credential stuffing attacks |
| Recovery | Medium | `before` (pre-recovery) | Prevents account enumeration via recovery |
| Verification | Low | `before` (pre-verification) | Optional additional protection |

### Passing the Token via transient_payload

When submitting a self-service flow, include the reCAPTCHA token in the `transient_payload` field of the request body:

```json
{
  "method": "password",
  "traits": {
    "email": "user@example.com"
  },
  "password": "secure-password",
  "transient_payload": {
    "recaptcha_token": "03AGdBq26..."
  }
}
```

## Client-Side Integration

### reCAPTCHA v2 (Checkbox)

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://www.google.com/recaptcha/api.js" async defer></script>
</head>
<body>
  <form id="registration-form">
    <!-- Your Ory registration form fields -->
    <input type="email" name="traits.email" placeholder="Email" />
    <input type="password" name="password" placeholder="Password" />

    <!-- reCAPTCHA v2 widget -->
    <div class="g-recaptcha" data-sitekey="YOUR_SITE_KEY" data-callback="onRecaptchaSuccess"></div>

    <button type="submit">Register</button>
  </form>

  <script>
    let recaptchaToken = '';

    function onRecaptchaSuccess(token) {
      recaptchaToken = token;
    }

    document.getElementById('registration-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!recaptchaToken) {
        alert('Please complete the reCAPTCHA challenge.');
        return;
      }

      // Get the current Ory registration flow
      const flowId = new URLSearchParams(window.location.search).get('flow');

      const response = await fetch(`https://<your-ory-project>.projects.oryapis.com/self-service/registration?flow=${flowId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'password',
          traits: {
            email: document.querySelector('[name="traits.email"]').value,
          },
          password: document.querySelector('[name="password"]').value,
          transient_payload: {
            recaptcha_token: recaptchaToken,
          },
        }),
      });

      const data = await response.json();
      // Handle response...
    });
  </script>
</body>
</html>
```

### reCAPTCHA v3 (Invisible / Score-Based)

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://www.google.com/recaptcha/api.js?render=YOUR_SITE_KEY"></script>
</head>
<body>
  <form id="registration-form">
    <input type="email" name="traits.email" placeholder="Email" />
    <input type="password" name="password" placeholder="Password" />
    <button type="submit">Register</button>
  </form>

  <script>
    document.getElementById('registration-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      // Execute reCAPTCHA v3 and get a token
      const recaptchaToken = await grecaptcha.execute('YOUR_SITE_KEY', { action: 'register' });

      const flowId = new URLSearchParams(window.location.search).get('flow');

      const response = await fetch(`https://<your-ory-project>.projects.oryapis.com/self-service/registration?flow=${flowId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'password',
          traits: {
            email: document.querySelector('[name="traits.email"]').value,
          },
          password: document.querySelector('[name="password"]').value,
          transient_payload: {
            recaptcha_token: recaptchaToken,
          },
        }),
      });

      const data = await response.json();
      // Handle response...
    });
  </script>
</body>
</html>
```

### React Example

```jsx
import { useEffect, useCallback } from 'react';

const RECAPTCHA_SITE_KEY = 'YOUR_SITE_KEY';

function RegistrationForm() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    document.head.appendChild(script);
    return () => document.head.removeChild(script);
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    const token = await window.grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: 'register' });

    // Submit to Ory with transient_payload
    const response = await fetch('/self-service/registration?flow=FLOW_ID', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'password',
        traits: { email: 'user@example.com' },
        password: 'secure-password',
        transient_payload: {
          recaptcha_token: token,
        },
      }),
    });
  }, []);

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <button type="submit">Register</button>
    </form>
  );
}
```

## Testing

### Test Keys (reCAPTCHA v2)

Google provides test keys that always pass validation:

| Key Type | Value |
|----------|-------|
| Site key | `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI` |
| Secret key | `6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe` |

> **Warning:** These test keys are for development only. They will accept all verification requests. Never use them in production.

### reCAPTCHA v3 Testing

reCAPTCHA v3 does not have dedicated test keys. Use your real keys in a development environment and check the score returned:

- **Score 1.0** — Very likely a legitimate user
- **Score 0.0** — Very likely a bot
- Recommended threshold: **0.5** (adjust based on your use case)

### Verification Steps

1. Register for reCAPTCHA keys at [https://www.google.com/recaptcha/admin](https://www.google.com/recaptcha/admin).
2. Add the site key to your frontend HTML.
3. Configure the Ory Actions webhook with the Jsonnet template (base64-encoded).
4. Test with the Google test keys to confirm the webhook fires correctly.
5. Submit a registration flow and verify the reCAPTCHA token is validated before the identity is created.
6. Test with an invalid/expired token and confirm the flow is rejected.

## Resources

- [Google reCAPTCHA Documentation](https://developers.google.com/recaptcha/docs/display)
- [reCAPTCHA v3 Documentation](https://developers.google.com/recaptcha/docs/v3)
- [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
- [Ory Actions (Webhooks) Documentation](https://www.ory.sh/docs/actions/overview)
- [Ory Kratos Self-Service Flows](https://www.ory.sh/docs/kratos/self-service)
- [Ory transient_payload Documentation](https://www.ory.sh/docs/kratos/self-service#transient-payload)
- [reCAPTCHA siteverify API Reference](https://developers.google.com/recaptcha/docs/verify)
