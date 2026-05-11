# Sift (Digital Trust & Safety) Integration with Ory Network

## Overview

Sift is a digital trust and safety platform that provides real-time fraud detection and account abuse prevention. It uses machine learning to analyze user events and return abuse scores that help you decide whether to allow, review, or block an action.

Key features:

- **Account abuse detection** — Identifies fake account creation, account takeover, and spam.
- **Real-time scoring** — Returns abuse scores (0-100) for each event, where higher scores indicate higher risk.
- **Workflows** — Configurable decision workflows that can automatically block, allow, or flag suspicious activity.
- **Content integrity** — Detects spam, scams, and abusive content.
- **Payment protection** — Fraud detection for payment flows (complementary to identity use cases).

This integration uses Ory Actions webhooks to send authentication events to Sift's Events API and act on the abuse scores returned.

## Integration Architecture

```
User Browser                    Ory Network                     Sift
     |                               |                               |
     |  1. User submits               |                               |
     |     registration/login         |                               |
     |------------------------------->|                               |
     |                               |                               |
     |                               |  2. Ory completes the flow.    |
     |                               |     Post-hook fires Ory Action |
     |                               |     (webhook).                 |
     |                               |                               |
     |                               |  3. Jsonnet builds Sift event  |
     |                               |     with user context, IP,     |
     |                               |     device, session info.      |
     |                               |------------------------------->|
     |                               |                               |
     |                               |  4. Sift returns abuse score   |
     |                               |     and workflow decision.     |
     |                               |<-------------------------------|
     |                               |                               |
     |                               |  5. Based on response:         |
     |                               |     - Low score: allow         |
     |                               |     - Medium: flag for review  |
     |                               |     - High: block/force verify |
     |                               |                               |
     |  6. Success or rejection       |                               |
     |<-------------------------------|                               |
```

## Ory Products

- **Ory Kratos (Identity)** — via Ory Actions (webhooks) as a post-registration and post-login hook.

## Prerequisites

1. **Sift account** — Sign up at [https://sift.com/](https://sift.com/).
2. **API Key** — Found in the Sift Console under Settings > API Keys. This is a REST API key used for server-side calls.
3. **Account ID** — Your Sift account ID, found in the Sift Console.
4. **Beacon Key** (optional) — For client-side device fingerprinting via the Sift JavaScript snippet.
5. **Ory Network project** — An active Ory Network project.

## Configuration

### Ory Actions Webhook Setup

Configure a **post-registration** and **post-login** webhook that sends events to Sift's Events API.

Using the Ory CLI:

```bash
ory patch identity-config <project-id> \
  --replace '/selfservice/flows/registration/after/password/hooks=[
    {
      "hook": "web_hook",
      "config": {
        "url": "https://api.sift.com/v205/events?return_workflow_status=true&return_score=true",
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
            "value": "application/json",
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
  local identity = ctx.identity,

  "$type": "$create_account",
  "$api_key": "YOUR_SIFT_API_KEY",
  "$user_id": identity.id,
  "$user_email": identity.traits.email,
  "$ip": ctx.request_headers["X-Forwarded-For"][0],
  "$browser": {
    "$user_agent": ctx.request_headers["User-Agent"][0],
  },
}
```

## Technical Details

### Full Webhook Configuration (YAML)

```yaml
selfservice:
  flows:
    registration:
      after:
        password:
          hooks:
            - hook: web_hook
              config:
                url: "https://api.sift.com/v205/events?return_workflow_status=true&return_score=true"
                method: POST
                body: "base64://<base64-encoded-registration-jsonnet>"
                can_interrupt: true
                response:
                  ignore: false
                  parse: true
                auth:
                  type: api_key
                  config:
                    name: Content-Type
                    value: application/json
                    in: header
    login:
      after:
        password:
          hooks:
            - hook: web_hook
              config:
                url: "https://api.sift.com/v205/events?return_workflow_status=true&return_score=true"
                method: POST
                body: "base64://<base64-encoded-login-jsonnet>"
                can_interrupt: true
                response:
                  ignore: false
                  parse: true
                auth:
                  type: api_key
                  config:
                    name: Content-Type
                    value: application/json
                    in: header
```

### Jsonnet Template (Post-Registration)

```jsonnet
function(ctx)
{
  local identity = ctx.identity,

  // Sift event type for account creation
  "$type": "$create_account",

  // Sift API key (server-side)
  "$api_key": "YOUR_SIFT_API_KEY",

  // User details
  "$user_id": identity.id,
  "$user_email": identity.traits.email,
  [if std.objectHas(identity.traits, "name") then "$name"]:
    identity.traits.name.first + " " + identity.traits.name.last,

  // Session and device context
  "$session_id": ctx.flow.id,
  "$ip": ctx.request_headers["X-Forwarded-For"][0],
  "$browser": {
    "$user_agent": ctx.request_headers["User-Agent"][0],
    "$accept_language": ctx.request_headers["Accept-Language"][0],
  },

  // Account creation details
  "$account_types": ["user"],
  "$social_sign_on_type": (
    if ctx.flow.active == "oidc" then "$google"
    else "$not_social"
  ),

  // Sift client-side session ID (if using Sift JS snippet)
  [if std.objectHas(ctx.flow.transient_payload, "sift_session_id") then "$session_id"]:
    ctx.flow.transient_payload.sift_session_id,
}
```

### Jsonnet Template (Post-Login)

```jsonnet
function(ctx)
{
  local identity = ctx.identity,

  // Sift event type for login
  "$type": "$login",

  // Sift API key
  "$api_key": "YOUR_SIFT_API_KEY",

  // Login status
  "$login_status": "$success",

  // User details
  "$user_id": identity.id,
  "$user_email": identity.traits.email,

  // Session and device context
  "$session_id": ctx.flow.id,
  "$ip": ctx.request_headers["X-Forwarded-For"][0],
  "$browser": {
    "$user_agent": ctx.request_headers["User-Agent"][0],
  },

  // Sift client-side session ID
  [if std.objectHas(ctx.flow.transient_payload, "sift_session_id") then "$session_id"]:
    ctx.flow.transient_payload.sift_session_id,
}
```

### Sift Events API Request (Registration)

```
POST https://api.sift.com/v205/events?return_workflow_status=true&return_score=true
Content-Type: application/json

{
  "$type": "$create_account",
  "$api_key": "YOUR_SIFT_API_KEY",
  "$user_id": "ory-identity-uuid",
  "$user_email": "user@example.com",
  "$ip": "203.0.113.1",
  "$browser": {
    "$user_agent": "Mozilla/5.0..."
  },
  "$account_types": ["user"]
}
```

### Sift Events API Response

```json
{
  "status": 0,
  "error_message": "OK",
  "score_response": {
    "status": 0,
    "error_message": "OK",
    "user_id": "ory-identity-uuid",
    "scores": {
      "account_abuse": {
        "score": 0.23,
        "reasons": [
          {
            "name": "Users per device",
            "value": "1"
          }
        ]
      }
    }
  },
  "workflow_statuses": [
    {
      "id": "workflow-id",
      "state": "running",
      "config": {
        "id": "config-id",
        "version": "1.0"
      },
      "config_display_name": "Account Creation Workflow",
      "abuse_types": ["account_abuse"],
      "entity": {
        "id": "ory-identity-uuid",
        "type": "user"
      },
      "history": [
        {
          "app": "decision",
          "name": "block suspicious accounts",
          "state": "finished",
          "config": {
            "decision_id": "decision-id"
          }
        }
      ],
      "route": {
        "name": "allow"
      }
    }
  ]
}
```

### Sift Abuse Scores

| Score Range | Risk Level | Recommended Action |
|-------------|-----------|-------------------|
| 0 - 30 | Low | Allow the action |
| 30 - 60 | Medium | Flag for manual review or require additional verification |
| 60 - 85 | High | Block the action or force identity verification |
| 85 - 100 | Very High | Block and flag the account |

### Using the Response to Modify Identity or Reject Flow

To act on the Sift response, use webhook response handling to flag suspicious accounts or block high-risk registrations:

```jsonnet
// Response parsing Jsonnet (applied to the Sift response)
function(ctx)
{
  local sift_response = ctx.body,
  local abuse_score = sift_response.score_response.scores.account_abuse.score,
  local workflow_action = sift_response.workflow_statuses[0].route.name,

  // Block if workflow says deny or score is very high
  [if workflow_action == "block" || abuse_score > 0.85 then "error"]: {
    code: 403,
    message: "Registration blocked due to suspected abuse.",
  },

  // Flag for review if score is medium-high
  [if abuse_score > 0.30 && abuse_score <= 0.85 then "identity"]: {
    metadata_public: {
      sift_abuse_score: abuse_score,
      sift_review_required: true,
    },
  },
}
```

### Triggering Additional Verification Based on Abuse Score

For medium-risk accounts that pass the initial check but are flagged:

1. The post-registration webhook stores the abuse score in `metadata_public`.
2. Your application checks `metadata_public.sift_review_required` after registration.
3. If flagged, require additional verification steps (email verification, phone verification, document upload).

```javascript
// In your application after registration
const session = await ory.toSession();
const metadata = session.identity.metadata_public;

if (metadata && metadata.sift_review_required) {
  // Force email verification or additional identity verification
  const verificationFlow = await ory.createBrowserVerificationFlow();
  window.location.href = verificationFlow.request_url;
}
```

## Flow Integration

### Recommended Flows to Protect

| Flow | Priority | Hook Type | Sift Event Type | Notes |
|------|----------|-----------|-----------------|-------|
| Registration | High | `after` (post-registration) | `$create_account` | Detect fake account creation |
| Login | High | `after` (post-login) | `$login` | Detect account takeover |
| Recovery | Medium | `after` (post-recovery) | `$update_password` | Detect ATO via password reset |
| Settings (password change) | Medium | `after` (post-settings) | `$update_password` | Detect compromised account changes |

### Passing Sift Context via transient_payload

When submitting a self-service flow, include any Sift client-side data:

```json
{
  "method": "password",
  "traits": {
    "email": "user@example.com"
  },
  "password": "secure-password",
  "transient_payload": {
    "sift_session_id": "sift-session-id-from-js-snippet"
  }
}
```

## Client-Side Integration

### Sift JavaScript Snippet

Sift provides a JavaScript snippet for client-side device fingerprinting and session tracking.

```html
<!DOCTYPE html>
<html>
<head>
  <script>
    // Sift JavaScript snippet
    var _sift = window._sift = window._sift || [];
    _sift.push(['_setAccount', 'YOUR_SIFT_BEACON_KEY']);
    _sift.push(['_setUserId', '']); // Set after login
    _sift.push(['_setSessionId', 'unique-session-id']);
    _sift.push(['_trackPageview']);

    (function() {
      function ls() {
        var e = document.createElement('script');
        e.src = 'https://cdn.sift.com/s.js';
        document.body.appendChild(e);
      }
      if (window.attachEvent) {
        window.attachEvent('onload', ls);
      } else {
        window.addEventListener('load', ls, false);
      }
    })();
  </script>
</head>
<body>
  <form id="registration-form">
    <input type="email" name="traits.email" placeholder="Email" />
    <input type="password" name="password" placeholder="Password" />
    <button type="submit">Register</button>
  </form>

  <script>
    const sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    document.getElementById('registration-form').addEventListener('submit', async (e) => {
      e.preventDefault();

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
            sift_session_id: sessionId,
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

const SIFT_BEACON_KEY = 'YOUR_SIFT_BEACON_KEY';

function RegistrationForm() {
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  useEffect(() => {
    // Initialize Sift
    window._sift = window._sift || [];
    window._sift.push(['_setAccount', SIFT_BEACON_KEY]);
    window._sift.push(['_setSessionId', sessionId]);
    window._sift.push(['_trackPageview']);

    const script = document.createElement('script');
    script.src = 'https://cdn.sift.com/s.js';
    document.body.appendChild(script);
    return () => document.body.removeChild(script);
  }, [sessionId]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    const response = await fetch('/self-service/registration?flow=FLOW_ID', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'password',
        traits: { email: 'user@example.com' },
        password: 'secure-password',
        transient_payload: {
          sift_session_id: sessionId,
        },
      }),
    });
  }, [sessionId]);

  return (
    <form onSubmit={handleSubmit}>
      <input type="email" name="traits.email" placeholder="Email" />
      <input type="password" name="password" placeholder="Password" />
      <button type="submit">Register</button>
    </form>
  );
}
```

## Testing

### Sift Sandbox

Sift provides a sandbox environment for testing:

- **Sandbox API Key** — Found in the Sift Console under the sandbox environment. Use this for all test API calls.
- **Test Mode** — Toggle between sandbox and production in the Sift Console.

### Test Scenarios

| Scenario | How to Test |
|----------|------------|
| Low-risk registration | Register with a normal email and device |
| High-risk registration | Register with disposable email services or known VPN IPs |
| Account takeover | Log in from a different device/location than usual |
| Bot behavior | Submit rapid sequential registrations |

### Verification Steps

1. Sign up for a Sift account and obtain your API Key and Beacon Key.
2. Add the Sift JavaScript snippet to your frontend.
3. Configure the Ory Actions webhook with the base64-encoded Jsonnet template.
4. Test using Sift's sandbox API key.
5. Create a test registration and verify the event appears in the Sift Console.
6. Check the abuse score in the Sift Console and verify it matches expectations.
7. Test the workflow action (allow/block) and verify the Ory flow responds correctly.
8. Switch to production keys for live traffic.

## Resources

- [Sift Documentation](https://developers.sift.com/)
- [Sift Events API Reference](https://developers.sift.com/docs/curl/events-api/overview)
- [Sift Score API Reference](https://developers.sift.com/docs/curl/score-api/overview)
- [Sift Workflows](https://developers.sift.com/docs/curl/workflows-api/overview)
- [Sift JavaScript Snippet](https://developers.sift.com/docs/curl/javascript-api)
- [Sift Console](https://console.sift.com/)
- [Ory Actions (Webhooks) Documentation](https://www.ory.sh/docs/actions/overview)
- [Ory Kratos Self-Service Flows](https://www.ory.sh/docs/kratos/self-service)
