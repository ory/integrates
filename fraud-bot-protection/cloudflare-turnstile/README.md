# Cloudflare Turnstile Integration with Ory Network

## Overview

Cloudflare Turnstile is a non-interactive CAPTCHA alternative that validates users without presenting visual puzzles. It uses a combination of browser signals, machine learning, and proof-of-work challenges to distinguish humans from bots, all without requiring user interaction in most cases.

Key features:

- **Non-interactive** — Most users never see a challenge; verification happens silently in the background.
- **Privacy-preserving** — Does not use cookies for tracking and does not collect personal data.
- **Free tier available** — Turnstile offers a generous free tier for most use cases.
- **Managed, non-interactive, and invisible modes** — Flexible widget rendering options.

This integration uses Ory Actions webhooks to validate Turnstile tokens server-side before registration or login flows complete.

## Integration Architecture

```
User Browser                    Ory Network                     Cloudflare Turnstile
     |                               |                               |
     |  1. Load page with             |                               |
     |     Turnstile widget           |                               |
     |<-------------------------------|                               |
     |                               |                               |
     |  2. Turnstile runs silently.   |                               |
     |     Token generated without    |                               |
     |     user interaction.          |                               |
     |                               |                               |
     |  3. Submit form with           |                               |
     |     Turnstile token in         |                               |
     |     transient_payload          |                               |
     |------------------------------->|                               |
     |                               |                               |
     |                               |  4. Pre-hook fires Ory Action  |
     |                               |     (webhook). Jsonnet builds  |
     |                               |     siteverify request.        |
     |                               |------------------------------->|
     |                               |                               |
     |                               |  5. Cloudflare responds with   |
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

1. **Cloudflare account** — Sign up at [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. **Turnstile widget** — Create a Turnstile widget in the Cloudflare dashboard under Turnstile. This generates a site key and secret key.
3. **Site key** — The public key embedded in your frontend.
4. **Secret key** — The private key used for server-side verification.
5. **Ory Network project** — An active Ory Network project with a custom UI.

## Configuration

### Ory Actions Webhook Setup

Configure a **pre-registration** (and optionally **pre-login**) webhook that calls Cloudflare's siteverify API.

Using the Ory CLI:

```bash
ory patch identity-config <project-id> \
  --replace '/selfservice/flows/registration/before/hooks=[
    {
      "hook": "web_hook",
      "config": {
        "url": "https://challenges.cloudflare.com/turnstile/v0/siteverify",
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
  // Extract the Turnstile token from the flow's transient_payload
  local turnstile_token = ctx.flow.transient_payload.turnstile_token,

  // Build the POST body for Cloudflare's siteverify endpoint
  body: "secret=YOUR_TURNSTILE_SECRET_KEY&response=" + turnstile_token,
}
```

> **Note:** Replace `YOUR_TURNSTILE_SECRET_KEY` with your actual Cloudflare Turnstile secret key.

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
              url: "https://challenges.cloudflare.com/turnstile/v0/siteverify"
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
              url: "https://challenges.cloudflare.com/turnstile/v0/siteverify"
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
  // Extract the Turnstile response token passed from the client
  local turnstile_token = ctx.flow.transient_payload.turnstile_token,

  // Construct the request body for Cloudflare's siteverify API
  // Format: application/x-www-form-urlencoded
  body: "secret=YOUR_TURNSTILE_SECRET_KEY"
        + "&response=" + turnstile_token
        + "&remoteip=" + ctx.request_headers["X-Forwarded-For"][0],
}
```

### Cloudflare siteverify Request

```
POST https://challenges.cloudflare.com/turnstile/v0/siteverify
Content-Type: application/x-www-form-urlencoded

secret=YOUR_SECRET_KEY&response=TURNSTILE_TOKEN&remoteip=USER_IP
```

### Cloudflare siteverify Response

**Successful verification:**

```json
{
  "success": true,
  "challenge_ts": "2024-01-15T12:00:00.000Z",
  "hostname": "your-app.example.com",
  "error-codes": [],
  "action": "login",
  "cdata": ""
}
```

**Failed verification:**

```json
{
  "success": false,
  "error-codes": ["invalid-input-response"],
  "messages": []
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `missing-input-secret` | The secret parameter was not passed |
| `invalid-input-secret` | The secret parameter is invalid or malformed |
| `missing-input-response` | The response parameter was not passed |
| `invalid-input-response` | The response parameter is invalid or has expired |
| `invalid-widget-id` | The widget ID in the parsed site key is invalid |
| `invalid-parsed-secret` | The secret extracted from the parsed site key is invalid |
| `bad-request` | The request was rejected because it was malformed |
| `timeout-or-duplicate` | The response parameter has already been validated or has expired |
| `internal-error` | An internal error occurred while validating the response |

## Flow Integration

### Recommended Flows to Protect

| Flow | Priority | Hook Type | Notes |
|------|----------|-----------|-------|
| Registration | High | `before` (pre-registration) | Primary defense against bot signups |
| Login | Medium | `before` (pre-login) | Prevents credential stuffing |
| Recovery | Medium | `before` (pre-recovery) | Prevents account enumeration |
| Verification | Low | `before` (pre-verification) | Optional protection |

### Passing the Token via transient_payload

When submitting a self-service flow, include the Turnstile token in the `transient_payload`:

```json
{
  "method": "password",
  "traits": {
    "email": "user@example.com"
  },
  "password": "secure-password",
  "transient_payload": {
    "turnstile_token": "0.AbCdEfGh..."
  }
}
```

## Client-Side Integration

### Standard Turnstile Widget

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head>
<body>
  <form id="registration-form">
    <input type="email" name="traits.email" placeholder="Email" />
    <input type="password" name="password" placeholder="Password" />

    <!-- Cloudflare Turnstile widget -->
    <div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY" data-callback="onTurnstileSuccess"></div>

    <button type="submit">Register</button>
  </form>

  <script>
    let turnstileToken = '';

    function onTurnstileSuccess(token) {
      turnstileToken = token;
    }

    document.getElementById('registration-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!turnstileToken) {
        alert('Please wait for verification to complete.');
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
            turnstile_token: turnstileToken,
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

### Invisible Turnstile Widget

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad" async defer></script>
</head>
<body>
  <form id="registration-form">
    <input type="email" name="traits.email" placeholder="Email" />
    <input type="password" name="password" placeholder="Password" />

    <!-- Invisible Turnstile container -->
    <div id="turnstile-container"></div>

    <button type="submit">Register</button>
  </form>

  <script>
    let turnstileWidgetId;

    function onTurnstileLoad() {
      turnstileWidgetId = turnstile.render('#turnstile-container', {
        sitekey: 'YOUR_SITE_KEY',
        appearance: 'interaction-only',
        callback: function(token) {
          submitRegistration(token);
        },
      });
    }

    async function submitRegistration(turnstileToken) {
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
            turnstile_token: turnstileToken,
          },
        }),
      });

      const data = await response.json();
      // Handle response...
    }

    document.getElementById('registration-form').addEventListener('submit', (e) => {
      e.preventDefault();
      // The Turnstile widget will automatically generate a token
      // If already generated, retrieve it
      const token = turnstile.getResponse(turnstileWidgetId);
      if (token) {
        submitRegistration(token);
      }
      // Otherwise wait for the callback
    });
  </script>
</body>
</html>
```

### React Example

```jsx
import { useEffect, useRef, useCallback, useState } from 'react';

const TURNSTILE_SITE_KEY = 'YOUR_SITE_KEY';

function RegistrationForm() {
  const containerRef = useRef(null);
  const [token, setToken] = useState('');

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.onload = () => {
      window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (t) => setToken(t),
      });
    };
    document.head.appendChild(script);
    return () => document.head.removeChild(script);
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    if (!token) {
      alert('Please wait for verification to complete.');
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
          turnstile_token: token,
        },
      }),
    });
  }, [token]);

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <div ref={containerRef} />
      <button type="submit">Register</button>
    </form>
  );
}
```

## Testing

### Test Keys

Cloudflare provides test keys for development:

| Type | Site Key | Secret Key | Behavior |
|------|----------|------------|----------|
| Always passes | `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` | Token always validates successfully |
| Always blocks | `2x00000000000000000000AB` | `2x0000000000000000000000000000000AB` | Token always fails validation |
| Forces interactive challenge | `3x00000000000000000000FF` | `3x0000000000000000000000000000000FF` | Forces a visible interactive challenge |

### Verification Steps

1. Create a Turnstile widget in the [Cloudflare dashboard](https://dash.cloudflare.com/?to=/:account/turnstile) and obtain your site key and secret key.
2. Add the Turnstile widget to your custom UI using the site key.
3. Configure the Ory Actions webhook with the base64-encoded Jsonnet template.
4. Test using Cloudflare's test keys listed above.
5. Submit a registration flow and verify the token is validated before the identity is created.
6. Test with the "always blocks" test key and confirm the flow is rejected.
7. Switch to production keys and verify end-to-end.

## Resources

- [Cloudflare Turnstile Documentation](https://developers.cloudflare.com/turnstile/)
- [Turnstile Get Started](https://developers.cloudflare.com/turnstile/get-started/)
- [Turnstile Client-Side Rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)
- [Turnstile Server-Side Validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Turnstile Testing Keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
- [Ory Actions (Webhooks) Documentation](https://www.ory.sh/docs/actions/overview)
- [Ory Kratos Self-Service Flows](https://www.ory.sh/docs/kratos/self-service)
- [Ory transient_payload Documentation](https://www.ory.sh/docs/kratos/self-service#transient-payload)
