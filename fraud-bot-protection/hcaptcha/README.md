# hCaptcha Integration with Ory Network

## Overview

hCaptcha is a privacy-focused CAPTCHA service that serves as an alternative to Google reCAPTCHA. It provides bot detection while being compliant with privacy regulations such as GDPR. hCaptcha does not sell personal data and offers publishers the ability to earn revenue from CAPTCHA challenges.

Key features:

- **Privacy-first** — Does not track users across sites or sell personal data.
- **GDPR-compliant** — Designed for compliance with European data protection regulations.
- **Drop-in replacement** — API-compatible with reCAPTCHA v2, making migration straightforward.
- **Enterprise tier** — Offers passive (invisible) and active challenge modes.

This integration uses Ory Actions webhooks to validate hCaptcha tokens server-side before registration or login flows complete.

## Integration Architecture

```
User Browser                    Ory Network                     hCaptcha
     |                               |                               |
     |  1. Load page with             |                               |
     |     hCaptcha widget            |                               |
     |<-------------------------------|                               |
     |                               |                               |
     |  2. User completes hCaptcha    |                               |
     |     challenge. Token returned. |                               |
     |                               |                               |
     |  3. Submit form with           |                               |
     |     hCaptcha token in          |                               |
     |     transient_payload          |                               |
     |------------------------------->|                               |
     |                               |                               |
     |                               |  4. Pre-hook fires Ory Action  |
     |                               |     (webhook). Jsonnet builds  |
     |                               |     siteverify request.        |
     |                               |------------------------------->|
     |                               |                               |
     |                               |  5. hCaptcha responds with     |
     |                               |     success/failure            |
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

1. **hCaptcha account** — Sign up at [https://www.hcaptcha.com/signup-interstitial](https://www.hcaptcha.com/signup-interstitial).
2. **Site key** — The public key for your site, found in the hCaptcha dashboard under Sites.
3. **Secret key** — The private API key for server-side verification, found in the hCaptcha dashboard under Settings.
4. **Ory Network project** — An active Ory Network project with a custom UI.

## Configuration

### Ory Actions Webhook Setup

Configure a **pre-registration** (and optionally **pre-login**) webhook that calls hCaptcha's siteverify API.

Using the Ory CLI:

```bash
ory patch identity-config <project-id> \
  --replace '/selfservice/flows/registration/before/hooks=[
    {
      "hook": "web_hook",
      "config": {
        "url": "https://api.hcaptcha.com/siteverify",
        "method": "POST",
        "body": "base64://YOUR_BASE64_ENCODED_JSONNET",
        "can_interrupt": true,
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

```jsonnet
function(ctx)
{
  // Extract the hCaptcha token from the flow's transient_payload
  local hcaptcha_token = ctx.flow.transient_payload.hcaptcha_token,

  // Build the POST body for hCaptcha's siteverify endpoint
  body: "secret=YOUR_HCAPTCHA_SECRET_KEY&response=" + hcaptcha_token
        + "&sitekey=YOUR_HCAPTCHA_SITE_KEY",
}
```

> **Note:** Replace `YOUR_HCAPTCHA_SECRET_KEY` and `YOUR_HCAPTCHA_SITE_KEY` with your actual keys.

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
              url: "https://api.hcaptcha.com/siteverify"
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
              url: "https://api.hcaptcha.com/siteverify"
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
  // Extract the hCaptcha response token passed from the client
  local hcaptcha_token = ctx.flow.transient_payload.hcaptcha_token,

  // Construct the request body for hCaptcha's siteverify API
  // Format: application/x-www-form-urlencoded
  body: "secret=YOUR_HCAPTCHA_SECRET_KEY"
        + "&response=" + hcaptcha_token
        + "&sitekey=YOUR_HCAPTCHA_SITE_KEY"
        + "&remoteip=" + ctx.request_headers["X-Forwarded-For"][0],
}
```

### hCaptcha siteverify Request

```
POST https://api.hcaptcha.com/siteverify
Content-Type: application/x-www-form-urlencoded

secret=YOUR_SECRET_KEY&response=HCAPTCHA_TOKEN&sitekey=YOUR_SITE_KEY&remoteip=USER_IP
```

### hCaptcha siteverify Response

**Successful verification:**

```json
{
  "success": true,
  "challenge_ts": "2024-01-15T12:00:00.000000Z",
  "hostname": "your-app.example.com",
  "credit": false
}
```

**Enterprise response (with score):**

```json
{
  "success": true,
  "challenge_ts": "2024-01-15T12:00:00.000000Z",
  "hostname": "your-app.example.com",
  "score": 0.1,
  "score_reason": ["safe"]
}
```

**Failed verification:**

```json
{
  "success": false,
  "error-codes": ["invalid-input-response"]
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `missing-input-secret` | Secret key is missing |
| `invalid-input-secret` | Secret key is invalid |
| `missing-input-response` | Response token is missing |
| `invalid-input-response` | Response token is invalid or malformed |
| `bad-request` | Request is invalid or malformed |
| `invalid-or-already-seen-response` | Token has already been used |
| `not-using-dummy-passcode` | Testing without the dummy secret |
| `sitekey-secret-mismatch` | Site key and secret key do not match |

## Flow Integration

### Recommended Flows to Protect

| Flow | Priority | Hook Type | Notes |
|------|----------|-----------|-------|
| Registration | High | `before` (pre-registration) | Primary defense against bot signups |
| Login | Medium | `before` (pre-login) | Prevents credential stuffing |
| Recovery | Medium | `before` (pre-recovery) | Prevents account enumeration |
| Verification | Low | `before` (pre-verification) | Optional protection |

### Passing the Token via transient_payload

When submitting a self-service flow, include the hCaptcha token in the `transient_payload`:

```json
{
  "method": "password",
  "traits": {
    "email": "user@example.com"
  },
  "password": "secure-password",
  "transient_payload": {
    "hcaptcha_token": "P0_eyJ0eXAi..."
  }
}
```

## Client-Side Integration

### Standard hCaptcha Widget

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://js.hcaptcha.com/1/api.js" async defer></script>
</head>
<body>
  <form id="registration-form">
    <input type="email" name="traits.email" placeholder="Email" />
    <input type="password" name="password" placeholder="Password" />

    <!-- hCaptcha widget -->
    <div class="h-captcha" data-sitekey="YOUR_SITE_KEY" data-callback="onHcaptchaSuccess"></div>

    <button type="submit">Register</button>
  </form>

  <script>
    let hcaptchaToken = '';

    function onHcaptchaSuccess(token) {
      hcaptchaToken = token;
    }

    document.getElementById('registration-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!hcaptchaToken) {
        alert('Please complete the hCaptcha challenge.');
        return;
      }

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
            hcaptcha_token: hcaptchaToken,
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

### Invisible hCaptcha

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://js.hcaptcha.com/1/api.js" async defer></script>
</head>
<body>
  <form id="registration-form">
    <input type="email" name="traits.email" placeholder="Email" />
    <input type="password" name="password" placeholder="Password" />

    <!-- Invisible hCaptcha -->
    <div class="h-captcha"
         data-sitekey="YOUR_SITE_KEY"
         data-size="invisible"
         data-callback="onHcaptchaSuccess"></div>

    <button type="submit">Register</button>
  </form>

  <script>
    function onHcaptchaSuccess(token) {
      // Token received, now submit to Ory
      submitRegistration(token);
    }

    async function submitRegistration(hcaptchaToken) {
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
            hcaptcha_token: hcaptchaToken,
          },
        }),
      });

      const data = await response.json();
      // Handle response...
    }

    document.getElementById('registration-form').addEventListener('submit', (e) => {
      e.preventDefault();
      // Trigger the invisible hCaptcha challenge
      hcaptcha.execute();
    });
  </script>
</body>
</html>
```

### React Example

```jsx
import { useEffect, useRef, useCallback } from 'react';

const HCAPTCHA_SITE_KEY = 'YOUR_SITE_KEY';

function RegistrationForm() {
  const captchaRef = useRef(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://js.hcaptcha.com/1/api.js';
    script.async = true;
    document.head.appendChild(script);
    return () => document.head.removeChild(script);
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    // Get the hCaptcha response token
    const token = window.hcaptcha.getResponse();

    if (!token) {
      alert('Please complete the hCaptcha challenge.');
      return;
    }

    const response = await fetch('/self-service/registration?flow=FLOW_ID', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'password',
        traits: { email: 'user@example.com' },
        password: 'secure-password',
        transient_payload: {
          hcaptcha_token: token,
        },
      }),
    });
  }, []);

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <div
        ref={captchaRef}
        className="h-captcha"
        data-sitekey={HCAPTCHA_SITE_KEY}
      />
      <button type="submit">Register</button>
    </form>
  );
}
```

## Testing

### Test Keys

hCaptcha provides test keys for development:

| Key Type | Value | Behavior |
|----------|-------|----------|
| Site key | `10000000-ffff-ffff-ffff-000000000001` | Always passes |
| Secret key | `0x0000000000000000000000000000000000000000` | Always passes |

For testing specific scenarios:

| Site key | Behavior |
|----------|----------|
| `10000000-ffff-ffff-ffff-000000000001` | Always passes (visible challenge) |
| `20000000-ffff-ffff-ffff-000000000002` | Always fails |
| `30000000-ffff-ffff-ffff-000000000003` | Always returns a score (enterprise) |

### Verification Steps

1. Register at [https://www.hcaptcha.com/](https://www.hcaptcha.com/) and obtain your site key and secret key.
2. Add the hCaptcha widget to your custom UI using the site key.
3. Configure the Ory Actions webhook with the base64-encoded Jsonnet template.
4. Test with the hCaptcha test keys listed above.
5. Submit a registration flow and verify the token is validated before the identity is created.
6. Test failure by using an invalid or expired token and confirm the flow is rejected.
7. Switch to production keys and verify end-to-end.

## Resources

- [hCaptcha Documentation](https://docs.hcaptcha.com/)
- [hCaptcha Dashboard](https://dashboard.hcaptcha.com/)
- [hCaptcha siteverify API](https://docs.hcaptcha.com/#verify-the-user-response-server-side)
- [hCaptcha Test Keys](https://docs.hcaptcha.com/#integration-testing-test-keys)
- [Ory Actions (Webhooks) Documentation](https://www.ory.sh/docs/actions/overview)
- [Ory Kratos Self-Service Flows](https://www.ory.sh/docs/kratos/self-service)
- [Ory transient_payload Documentation](https://www.ory.sh/docs/kratos/self-service#transient-payload)
