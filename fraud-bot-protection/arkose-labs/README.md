# Arkose Labs Integration with Ory Network

## Overview

Arkose Labs is a bot detection and fraud prevention platform that uses adaptive enforcement challenges to stop automated attacks while allowing legitimate users through. It is designed for high-value transactions such as account creation, login, and payment flows.

Key features:

- **Enforcement challenges** — Presents interactive challenges (3D puzzles, image matching) only to suspicious sessions, while legitimate users pass through with minimal friction.
- **Bot detection** — Uses telemetry, device fingerprinting, and behavioral analysis to detect automated attacks in real time.
- **Session risk scoring** — Provides a risk classification for each session to inform server-side decisions.
- **Invisible mode** — Low-risk users see no challenge at all; enforcement only activates for suspicious sessions.
- **Targeted protection** — Designed for high-value actions: account creation, login, password reset, and payment.

This integration uses the Arkose Labs client-side Enforcement SDK to generate a session token, which is then validated server-side via an Ory Actions webhook calling the Arkose Labs Verify API.

## Integration Architecture

```
User Browser                    Ory Network                     Arkose Labs
     |                               |                               |
     |  1. Load page with Arkose     |                               |
     |     Enforcement SDK.          |                               |
     |     SDK collects telemetry    |                               |
     |     and may present a         |                               |
     |     challenge.                |                               |
     |<-------------------------------------------------------------->|
     |                               |                               |
     |  2. Arkose returns session    |                               |
     |     token to client.          |                               |
     |                               |                               |
     |  3. Submit form with          |                               |
     |     Arkose session token      |                               |
     |     in transient_payload      |                               |
     |------------------------------->|                               |
     |                               |                               |
     |                               |  4. Pre-hook fires Ory Action  |
     |                               |     (webhook). Jsonnet builds  |
     |                               |     verify request.            |
     |                               |------------------------------->|
     |                               |                               |
     |                               |  5. Arkose responds with       |
     |                               |     session risk details       |
     |                               |     and solved status.         |
     |                               |<-------------------------------|
     |                               |                               |
     |                               |  6. If valid, flow continues.  |
     |                               |     If invalid, flow is        |
     |                               |     rejected.                  |
     |                               |                               |
     |  7. Success or error           |                               |
     |<-------------------------------|                               |
```

## Ory Products

- **Ory Kratos (Identity)** — via Ory Actions (webhooks) as a pre-registration or pre-login hook (token validation) and optionally as a post-login hook (risk-based decisions).

## Prerequisites

1. **Arkose Labs account** — Contact [Arkose Labs](https://www.arkoselabs.com/contact/) to obtain an account.
2. **Public Key** — The public key for your Arkose Labs deployment, used in the client-side Enforcement SDK.
3. **Private Key** — The private API key for server-side token verification.
4. **Verify API URL** — Your assigned Arkose Labs Verify API endpoint (typically `https://verify.arkoselabs.com/api/v4/verify/`).
5. **Ory Network project** — An active Ory Network project with a custom UI.

## Configuration

### Ory Actions Webhook Setup

Configure a **pre-registration** (and optionally **pre-login**) webhook that calls the Arkose Labs Verify API.

Using the Ory CLI:

```bash
ory patch identity-config <project-id> \
  --replace '/selfservice/flows/registration/before/hooks=[
    {
      "hook": "web_hook",
      "config": {
        "url": "https://verify.arkoselabs.com/api/v4/verify/",
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
  // Extract the Arkose session token from transient_payload
  local arkose_token = ctx.flow.transient_payload.arkose_token,

  // Build the POST body for Arkose Labs Verify API
  body: "private_key=YOUR_ARKOSE_PRIVATE_KEY&session_token=" + arkose_token,
}
```

> **Note:** Replace `YOUR_ARKOSE_PRIVATE_KEY` with your actual Arkose Labs private key.

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
              url: "https://verify.arkoselabs.com/api/v4/verify/"
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
              url: "https://verify.arkoselabs.com/api/v4/verify/"
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

### Jsonnet Template (Full — Pre-Registration/Login)

```jsonnet
function(ctx)
{
  // Extract the Arkose Labs session token from the client
  local arkose_token = ctx.flow.transient_payload.arkose_token,

  // Construct the request body for the Arkose Verify API
  // Format: application/x-www-form-urlencoded
  body: "private_key=YOUR_ARKOSE_PRIVATE_KEY"
        + "&session_token=" + arkose_token,
}
```

### Jsonnet Template (Post-Login — Risk-Based Decisions)

For post-login risk-based decisions, use a separate webhook that acts on the Arkose verification response:

```jsonnet
function(ctx)
{
  local identity = ctx.identity,
  local arkose_token = ctx.flow.transient_payload.arkose_token,

  // Build the verify request
  body: "private_key=YOUR_ARKOSE_PRIVATE_KEY"
        + "&session_token=" + arkose_token,
}
```

### Arkose Labs Verify API Request

```
POST https://verify.arkoselabs.com/api/v4/verify/
Content-Type: application/x-www-form-urlencoded

private_key=YOUR_PRIVATE_KEY&session_token=ARKOSE_SESSION_TOKEN
```

### Arkose Labs Verify API Response

**Successful verification (challenge solved):**

```json
{
  "session_token": "arkose-session-token",
  "solved": true,
  "session_details": {
    "solved": true,
    "session": "arkose-session-id",
    "suppressed": false,
    "security_level": 50,
    "attempted": true,
    "previously_verified": false,
    "risk_category": "LOW",
    "telemetry_risk_category": "LOW"
  },
  "session_risk": {
    "global": {
      "score": 20,
      "risk_band": "Low"
    }
  }
}
```

**Failed verification (challenge not solved or bot detected):**

```json
{
  "session_token": "arkose-session-token",
  "solved": false,
  "session_details": {
    "solved": false,
    "session": "arkose-session-id",
    "suppressed": false,
    "security_level": 100,
    "attempted": true,
    "previously_verified": false,
    "risk_category": "HIGH",
    "telemetry_risk_category": "HIGH"
  },
  "session_risk": {
    "global": {
      "score": 90,
      "risk_band": "High"
    }
  }
}
```

**Invalid token:**

```json
{
  "session_token": "invalid-token",
  "error": "Invalid session token"
}
```

### Risk Categories

| Risk Category | Score Range | Description |
|---------------|-----------|-------------|
| `LOW` | 0 - 30 | Legitimate user; no challenge shown or challenge easily solved |
| `MEDIUM` | 30 - 70 | Moderate risk; challenge presented and solved |
| `HIGH` | 70 - 100 | High risk; challenge failed, bot detected, or suspicious telemetry |

### Using the Response to Modify Identity or Reject Flow

To reject flows based on Arkose verification results:

```jsonnet
// Response parsing Jsonnet (applied to the Arkose verify response)
function(ctx)
{
  local arkose_response = ctx.body,

  // Block if the challenge was not solved
  [if !arkose_response.solved then "error"]: {
    code: 403,
    message: "Verification challenge failed. Please try again.",
  },

  // Block if the risk category is HIGH
  [if arkose_response.session_details.risk_category == "HIGH" then "error"]: {
    code: 403,
    message: "Request blocked due to suspicious activity.",
  },

  // Flag medium-risk sessions for additional monitoring
  [if arkose_response.session_details.risk_category == "MEDIUM" then "identity"]: {
    metadata_public: {
      arkose_risk_category: arkose_response.session_details.risk_category,
      arkose_risk_score: arkose_response.session_risk.global.score,
      require_additional_verification: true,
    },
  },
}
```

### Triggering MFA Step-Up Based on Risk

For medium-risk sessions where the challenge was solved but telemetry is suspicious:

1. The webhook stores the risk score in `metadata_public`.
2. Your application checks `metadata_public.require_additional_verification`.
3. If flagged, trigger MFA or additional verification.

```javascript
// In your application after login
const session = await ory.toSession();
const metadata = session.identity.metadata_public;

if (metadata && metadata.require_additional_verification) {
  // Trigger MFA step-up
  const settingsFlow = await ory.createBrowserSettingsFlow();
  window.location.href = settingsFlow.request_url;
}
```

## Flow Integration

### Recommended Flows to Protect

| Flow | Priority | Hook Type | Notes |
|------|----------|-----------|-------|
| Registration | High | `before` (pre-registration) | Primary defense against bot signups and fake accounts |
| Login | High | `before` (pre-login) | Prevents credential stuffing and ATO |
| Recovery | Medium | `before` (pre-recovery) | Prevents automated password reset abuse |

### Passing the Arkose Token via transient_payload

When submitting a self-service flow, include the Arkose session token:

```json
{
  "method": "password",
  "traits": {
    "email": "user@example.com"
  },
  "password": "secure-password",
  "transient_payload": {
    "arkose_token": "arkose-session-token-value"
  }
}
```

## Client-Side Integration

### Arkose Labs Enforcement SDK

The Arkose Labs Enforcement SDK is loaded on the client to collect telemetry and (when necessary) present a challenge to the user.

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Arkose Labs Enforcement SDK -->
  <script
    src="https://client-api.arkoselabs.com/v2/YOUR_PUBLIC_KEY/api.js"
    data-callback="setupEnforcement"
    async
    defer
  ></script>
</head>
<body>
  <form id="registration-form">
    <input type="email" name="traits.email" placeholder="Email" />
    <input type="password" name="password" placeholder="Password" />

    <!-- Arkose challenge container (challenge renders here when needed) -->
    <div id="arkose-enforcement"></div>

    <button type="submit" id="submit-btn" disabled>Register</button>
  </form>

  <script>
    let arkoseToken = '';

    function setupEnforcement(enforcement) {
      enforcement.setConfig({
        selector: '#arkose-enforcement',
        onReady: function() {
          // SDK is ready
          document.getElementById('submit-btn').disabled = false;
        },
        onCompleted: function(response) {
          // Challenge completed (or bypassed for low-risk users)
          arkoseToken = response.token;
        },
        onError: function(error) {
          console.error('Arkose error:', error);
        },
      });
    }

    document.getElementById('registration-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!arkoseToken) {
        alert('Please complete the verification.');
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
            arkose_token: arkoseToken,
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

### Inline Trigger Mode

For cases where you want to trigger the challenge explicitly (e.g., on form submit):

```html
<script>
  let enforcement;
  let arkoseToken = '';

  function setupEnforcement(myEnforcement) {
    enforcement = myEnforcement;
    enforcement.setConfig({
      selector: '#arkose-enforcement',
      mode: 'inline',
      onCompleted: function(response) {
        arkoseToken = response.token;
        // Now submit the form
        submitForm();
      },
      onError: function(error) {
        console.error('Arkose error:', error);
      },
    });
  }

  document.getElementById('registration-form').addEventListener('submit', (e) => {
    e.preventDefault();
    // Trigger the Arkose challenge
    enforcement.run();
  });

  async function submitForm() {
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
          arkose_token: arkoseToken,
        },
      }),
    });

    const data = await response.json();
    // Handle response...
  }
</script>
```

### React Example

```jsx
import { useEffect, useRef, useCallback, useState } from 'react';

const ARKOSE_PUBLIC_KEY = 'YOUR_ARKOSE_PUBLIC_KEY';

function RegistrationForm() {
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const enforcementRef = useRef(null);

  useEffect(() => {
    // Define the callback before loading the script
    window.setupArkoseEnforcement = (enforcement) => {
      enforcementRef.current = enforcement;
      enforcement.setConfig({
        selector: '#arkose-enforcement',
        onReady: () => setReady(true),
        onCompleted: (response) => setToken(response.token),
        onError: (error) => console.error('Arkose error:', error),
      });
    };

    const script = document.createElement('script');
    script.src = `https://client-api.arkoselabs.com/v2/${ARKOSE_PUBLIC_KEY}/api.js`;
    script.setAttribute('data-callback', 'setupArkoseEnforcement');
    script.async = true;
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
      delete window.setupArkoseEnforcement;
    };
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    if (!token) {
      // Trigger enforcement if token not yet obtained
      if (enforcementRef.current) {
        enforcementRef.current.run();
      }
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
          arkose_token: token,
        },
      }),
    });
  }, [token]);

  return (
    <form onSubmit={handleSubmit}>
      <input type="email" placeholder="Email" />
      <input type="password" placeholder="Password" />
      <div id="arkose-enforcement" />
      <button type="submit" disabled={!ready}>Register</button>
    </form>
  );
}
```

## Testing

### Test Environment

Arkose Labs provides a staging/testing environment:

- **Staging Public Key** — Provided by your Arkose Labs account representative for testing.
- **Staging Private Key** — Corresponding private key for verify API calls in the test environment.
- **Test Mode** — Arkose Labs can configure your staging key to always present a challenge or always suppress it.

### Testing Scenarios

| Scenario | How to Test |
|----------|------------|
| Low-risk (no challenge) | Normal browsing behavior from a clean device |
| Medium-risk (challenge shown) | Use Tor, VPN, or automation tools |
| High-risk (challenge fails) | Use headless browsers or known bot user agents |
| Token validation success | Submit a valid token to the Verify API |
| Token validation failure | Submit an expired or tampered token |

### Verification Steps

1. Obtain your Public Key and Private Key from your Arkose Labs account representative.
2. Add the Arkose Enforcement SDK to your custom UI.
3. Configure the Ory Actions webhook with the base64-encoded Jsonnet template.
4. Test in the staging environment with your staging keys.
5. Verify that low-risk users pass through without seeing a challenge.
6. Verify that suspicious sessions trigger an enforcement challenge.
7. Test server-side validation by submitting the flow and checking the Verify API response.
8. Test with an invalid token and confirm the flow is rejected.
9. Switch to production keys for live traffic.

## Resources

- [Arkose Labs Documentation](https://developer.arkoselabs.com/)
- [Arkose Labs Enforcement SDK](https://developer.arkoselabs.com/docs/standard-setup)
- [Arkose Labs Verify API](https://developer.arkoselabs.com/docs/verify-api)
- [Arkose Labs Dashboard](https://dashboard.arkoselabs.com/)
- [Arkose Labs Contact](https://www.arkoselabs.com/contact/)
- [Ory Actions (Webhooks) Documentation](https://www.ory.sh/docs/actions/overview)
- [Ory Kratos Self-Service Flows](https://www.ory.sh/docs/kratos/self-service)
- [Ory transient_payload Documentation](https://www.ory.sh/docs/kratos/self-service#transient-payload)
