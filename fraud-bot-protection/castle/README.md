# Castle.io Integration with Ory Network

## Overview

Castle is an adaptive risk scoring platform that provides real-time threat detection for authentication flows. It analyzes device context, IP addresses, user behavior, and network signals to produce a risk score and recommended action for each authentication event.

Key features:

- **Adaptive risk scoring** — Returns a risk score (0.0 to 1.0) for each event based on device fingerprinting, IP reputation, and behavioral analysis.
- **Recommended actions** — Provides an actionable recommendation: `allow`, `challenge`, or `deny`.
- **Device intelligence** — Tracks device fingerprints to detect account takeover attempts and new/suspicious devices.
- **MFA step-up** — Risk scores can trigger step-up authentication (MFA) for suspicious login attempts.
- **Account takeover protection** — Detects credential stuffing, brute force, and bot-driven attacks.

This integration uses Ory Actions webhooks to send authentication events to Castle's Risk API and act on the response.

## Integration Architecture

```
User Browser                    Ory Network                     Castle.io
     |                               |                               |
     |  1. User submits login         |                               |
     |     (with Castle device        |                               |
     |     fingerprint in             |                               |
     |     transient_payload)         |                               |
     |------------------------------->|                               |
     |                               |                               |
     |                               |  2. Ory authenticates user.    |
     |                               |     Post-login hook fires      |
     |                               |     Ory Action (webhook).      |
     |                               |                               |
     |                               |  3. Jsonnet builds risk        |
     |                               |     assessment request with    |
     |                               |     user context, IP, device.  |
     |                               |------------------------------->|
     |                               |                               |
     |                               |  4. Castle returns risk score  |
     |                               |     and action recommendation  |
     |                               |     (allow/challenge/deny).    |
     |                               |<-------------------------------|
     |                               |                               |
     |                               |  5. Based on response:         |
     |                               |     - allow: continue flow     |
     |                               |     - challenge: trigger MFA   |
     |                               |     - deny: reject login       |
     |                               |                               |
     |  6. Success, MFA prompt,       |                               |
     |     or rejection               |                               |
     |<-------------------------------|                               |
```

## Ory Products

- **Ory Kratos (Identity)** — via Ory Actions (webhooks) as a post-login and post-registration hook.

## Prerequisites

1. **Castle account** — Sign up at [https://dashboard.castle.io/signup](https://dashboard.castle.io/signup).
2. **API Secret** — Found in the Castle dashboard under Configuration > General. This is used for server-side API calls.
3. **Publishable API Key** — Used for the client-side Castle.js SDK to collect device fingerprints.
4. **Ory Network project** — An active Ory Network project.

## Configuration

### Ory Actions Webhook Setup

Configure a **post-login** webhook that sends authentication events to Castle's Risk API.

Using the Ory CLI:

```bash
ory patch identity-config <project-id> \
  --replace '/selfservice/flows/login/after/hooks=[
    {
      "hook": "web_hook",
      "config": {
        "url": "https://api.castle.io/v1/risk",
        "method": "POST",
        "body": "base64://YOUR_BASE64_ENCODED_JSONNET",
        "can_interrupt": true,
        "response": {
          "ignore": false,
          "parse": true
        },
        "auth": {
          "type": "basic_auth",
          "config": {
            "user": "",
            "password": "YOUR_CASTLE_API_SECRET"
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
  local identity = ctx.identity,

  type: "$login",
  status: "$succeeded",
  request_token: ctx.flow.transient_payload.castle_request_token,
  user: {
    id: identity.id,
    email: identity.traits.email,
    registered_at: identity.created_at,
  },
  context: {
    ip: ctx.request_headers["X-Forwarded-For"][0],
    headers: {
      "User-Agent": ctx.request_headers["User-Agent"][0],
      Accept: ctx.request_headers["Accept"][0],
    },
  },
}
```

## Technical Details

### Full Webhook Configuration (YAML)

```yaml
selfservice:
  flows:
    login:
      after:
        password:
          hooks:
            - hook: web_hook
              config:
                url: "https://api.castle.io/v1/risk"
                method: POST
                body: "base64://<base64-encoded-jsonnet>"
                can_interrupt: true
                response:
                  ignore: false
                  parse: true
                auth:
                  type: basic_auth
                  config:
                    user: ""
                    password: "YOUR_CASTLE_API_SECRET"
    registration:
      after:
        password:
          hooks:
            - hook: web_hook
              config:
                url: "https://api.castle.io/v1/risk"
                method: POST
                body: "base64://<base64-encoded-jsonnet>"
                can_interrupt: false
                response:
                  ignore: false
                  parse: true
                auth:
                  type: basic_auth
                  config:
                    user: ""
                    password: "YOUR_CASTLE_API_SECRET"
```

### Jsonnet Template (Post-Login)

```jsonnet
function(ctx)
{
  local identity = ctx.identity,

  // Castle event type for login
  type: "$login",
  status: "$succeeded",

  // Castle request token from client-side SDK (device fingerprint)
  request_token: ctx.flow.transient_payload.castle_request_token,

  // User information
  user: {
    id: identity.id,
    email: identity.traits.email,
    registered_at: identity.created_at,
    [if std.objectHas(identity.traits, "name") then "name"]:
      identity.traits.name.first + " " + identity.traits.name.last,
  },

  // Request context
  context: {
    ip: ctx.request_headers["X-Forwarded-For"][0],
    headers: {
      "User-Agent": ctx.request_headers["User-Agent"][0],
    },
  },
}
```

### Jsonnet Template (Post-Registration)

```jsonnet
function(ctx)
{
  local identity = ctx.identity,

  // Castle event type for registration
  type: "$registration",
  status: "$succeeded",

  // Castle request token from client-side SDK
  request_token: ctx.flow.transient_payload.castle_request_token,

  // User information
  user: {
    id: identity.id,
    email: identity.traits.email,
    registered_at: identity.created_at,
  },

  // Request context
  context: {
    ip: ctx.request_headers["X-Forwarded-For"][0],
    headers: {
      "User-Agent": ctx.request_headers["User-Agent"][0],
    },
  },
}
```

### Castle Risk API Request

```
POST https://api.castle.io/v1/risk
Authorization: Basic base64(:YOUR_CASTLE_API_SECRET)
Content-Type: application/json

{
  "type": "$login",
  "status": "$succeeded",
  "request_token": "castle_request_token_from_client",
  "user": {
    "id": "ory-identity-uuid",
    "email": "user@example.com",
    "registered_at": "2024-01-01T00:00:00Z"
  },
  "context": {
    "ip": "203.0.113.1",
    "headers": {
      "User-Agent": "Mozilla/5.0..."
    }
  }
}
```

### Castle Risk API Response

```json
{
  "risk": 0.34,
  "signals": {
    "bot_behavior": {},
    "spoofed_device": {},
    "multiple_accounts_per_device": {}
  },
  "policy": {
    "id": "q-0987654321",
    "revision_id": "r-1234567890",
    "name": "Default Login Policy",
    "action": "allow"
  },
  "device": {
    "token": "device-token-uuid",
    "risk": 0.12,
    "is_new": false
  }
}
```

### Policy Actions

| Action | Risk Level | Recommended Response |
|--------|-----------|---------------------|
| `allow` | Low (0.0 - 0.3) | Allow the login to proceed normally |
| `challenge` | Medium (0.3 - 0.7) | Trigger MFA step-up or additional verification |
| `deny` | High (0.7 - 1.0) | Block the login attempt |

### Using the Response to Modify Identity or Reject Flow

To act on the Castle response, configure the webhook response handling to interrupt the flow when the action is `deny`:

```jsonnet
// Response parsing Jsonnet (applied to the Castle response)
function(ctx)
{
  local castle_response = ctx.body,

  // If Castle recommends denying, interrupt the flow
  [if castle_response.policy.action == "deny" then "error"]: {
    code: 403,
    message: "Login blocked due to suspicious activity.",
  },

  // If Castle recommends challenging, flag the identity for MFA
  [if castle_response.policy.action == "challenge" then "identity"]: {
    metadata_public: {
      castle_risk_score: castle_response.risk,
      castle_action: castle_response.policy.action,
      require_mfa: true,
    },
  },
}
```

### Triggering MFA Step-Up Based on Risk Score

To trigger MFA when Castle returns a `challenge` action:

1. The post-login webhook stores the risk score in `metadata_public`.
2. Your application checks `metadata_public.require_mfa` after login.
3. If `require_mfa` is `true`, redirect the user to the Ory settings flow to complete a second factor.

```javascript
// In your application after login
const session = await ory.toSession();
const metadata = session.identity.metadata_public;

if (metadata && metadata.require_mfa) {
  // Redirect to MFA verification
  const settingsFlow = await ory.createBrowserSettingsFlow();
  window.location.href = settingsFlow.request_url;
}
```

## Flow Integration

### Recommended Flows to Protect

| Flow | Priority | Hook Type | Castle Event Type | Notes |
|------|----------|-----------|-------------------|-------|
| Login | High | `after` (post-login) | `$login` | Primary use case for risk scoring |
| Registration | High | `after` (post-registration) | `$registration` | Detect fake/bot registrations |
| Recovery | Medium | `after` (post-recovery) | `$password_reset_request` | Detect ATO via recovery flow |

### Passing the Castle Request Token via transient_payload

When submitting a login or registration flow, include the Castle request token:

```json
{
  "method": "password",
  "identifier": "user@example.com",
  "password": "secure-password",
  "transient_payload": {
    "castle_request_token": "castle-request-token-from-js-sdk"
  }
}
```

## Client-Side Integration

### Castle.js SDK

The Castle.js SDK collects device fingerprints and generates request tokens that are sent to the Castle API for risk assessment.

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.castle.io/v2/castle.js" async defer></script>
</head>
<body>
  <form id="login-form">
    <input type="email" name="identifier" placeholder="Email" />
    <input type="password" name="password" placeholder="Password" />
    <button type="submit">Log In</button>
  </form>

  <script>
    // Initialize Castle with your publishable API key
    _castle('setKey', 'YOUR_CASTLE_PUBLISHABLE_API_KEY');

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      // Create a request token (device fingerprint)
      const requestToken = _castle('createRequestToken');

      const flowId = new URLSearchParams(window.location.search).get('flow');

      const response = await fetch(`https://<your-ory-project>.projects.oryapis.com/self-service/login?flow=${flowId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'password',
          identifier: document.querySelector('[name="identifier"]').value,
          password: document.querySelector('[name="password"]').value,
          transient_payload: {
            castle_request_token: requestToken,
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

const CASTLE_PUBLISHABLE_KEY = 'YOUR_CASTLE_PUBLISHABLE_API_KEY';

function LoginForm() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.castle.io/v2/castle.js';
    script.onload = () => {
      window._castle('setKey', CASTLE_PUBLISHABLE_KEY);
    };
    document.head.appendChild(script);
    return () => document.head.removeChild(script);
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    const requestToken = window._castle('createRequestToken');

    const response = await fetch('/self-service/login?flow=FLOW_ID', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'password',
        identifier: 'user@example.com',
        password: 'secure-password',
        transient_payload: {
          castle_request_token: requestToken,
        },
      }),
    });
  }, []);

  return (
    <form onSubmit={handleSubmit}>
      <input type="email" name="identifier" placeholder="Email" />
      <input type="password" name="password" placeholder="Password" />
      <button type="submit">Log In</button>
    </form>
  );
}
```

## Testing

### Test Environment

Castle provides a sandbox environment for testing:

- **Sandbox API** — Use the same API endpoints; Castle identifies sandbox requests by your API secret.
- **Test API Secret** — Found in your Castle dashboard under the test environment toggle.

### Simulating Risk Scores

Castle allows you to simulate different risk scores in the sandbox:

| Test Email | Simulated Action |
|------------|-----------------|
| `allow@example.com` | Returns `allow` action |
| `challenge@example.com` | Returns `challenge` action |
| `deny@example.com` | Returns `deny` action |

### Verification Steps

1. Sign up for a Castle account and obtain your API Secret and Publishable Key.
2. Add Castle.js to your frontend and collect request tokens.
3. Configure the Ory Actions webhook with the base64-encoded Jsonnet template.
4. Test with Castle's sandbox environment.
5. Submit a login flow and verify the risk assessment request is sent to Castle.
6. Test the `challenge` scenario and verify MFA step-up is triggered.
7. Test the `deny` scenario and verify the flow is rejected.
8. Monitor events in the Castle dashboard.

## Resources

- [Castle Documentation](https://docs.castle.io/)
- [Castle Risk API Reference](https://docs.castle.io/docs/api-reference)
- [Castle.js SDK](https://docs.castle.io/docs/sdk-browser)
- [Castle Event Types](https://docs.castle.io/docs/events)
- [Castle Policies](https://docs.castle.io/docs/creating-policies)
- [Castle Dashboard](https://dashboard.castle.io/)
- [Ory Actions (Webhooks) Documentation](https://www.ory.sh/docs/actions/overview)
- [Ory Kratos Self-Service Flows](https://www.ory.sh/docs/kratos/self-service)
- [Ory MFA Documentation](https://www.ory.sh/docs/kratos/mfa/overview)
