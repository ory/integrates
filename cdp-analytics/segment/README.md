# Segment Integration for Ory Network

Send `identify` and `track` calls to Segment when users register or log in via Ory. Uses Ory Actions webhooks to call Segment's HTTP Tracking API.

**Platform:** Ory Network (managed cloud)

---

## Overview

This integration uses Ory Actions **post-registration** and **post-login** webhooks to send events to Segment's HTTP Tracking API. Registration triggers an `identify` call (to create/update the user profile in Segment) and a `track` call (to record the "User Registered" event). Login triggers a `track` call for "User Logged In".

**Flow:**

1. User registers or logs in via Ory.
2. Ory Actions fires the appropriate webhook.
3. The Jsonnet template maps the identity to a Segment API payload.
4. Segment receives and routes the event to connected destinations.

---

## Segment API Details

| Detail | Value |
|---|---|
| **Endpoint** | `https://api.segment.io/v1/identify` or `https://api.segment.io/v1/track` |
| **Method** | `POST` |
| **Auth** | HTTP Basic Auth (Write Key as username, empty password) |
| **Content-Type** | `application/json` |

The Write Key is base64-encoded as `WRITE_KEY:` (note the trailing colon) and sent as `Basic <encoded>`.

To get your Write Key: **Segment > Sources > Your Source > Settings > API Keys**.

---

## Ory Actions Webhook Configuration

### Post-Registration: Identify + Track

```yaml
selfservice:
  flows:
    registration:
      after:
        password:
          hooks:
            - hook: web_hook
              config:
                url: https://api.segment.io/v1/identify
                method: POST
                headers:
                  Content-Type: application/json
                  Authorization: "Basic YOUR_BASE64_ENCODED_WRITE_KEY"
                body: file:///etc/config/ory/segment_identify.jsonnet
                can_interrupt: false
                response:
                  ignore: true
            - hook: web_hook
              config:
                url: https://api.segment.io/v1/track
                method: POST
                headers:
                  Content-Type: application/json
                  Authorization: "Basic YOUR_BASE64_ENCODED_WRITE_KEY"
                body: file:///etc/config/ory/segment_track_registration.jsonnet
                can_interrupt: false
                response:
                  ignore: true
```

### Post-Login: Track

```yaml
selfservice:
  flows:
    login:
      after:
        password:
          hooks:
            - hook: web_hook
              config:
                url: https://api.segment.io/v1/track
                method: POST
                headers:
                  Content-Type: application/json
                  Authorization: "Basic YOUR_BASE64_ENCODED_WRITE_KEY"
                body: file:///etc/config/ory/segment_track_login.jsonnet
                can_interrupt: false
                response:
                  ignore: true
```

### Generating the Basic Auth Header

```bash
# Replace YOUR_SEGMENT_WRITE_KEY with your actual write key
echo -n 'YOUR_SEGMENT_WRITE_KEY:' | base64
```

---

## Jsonnet Templates

### Identify (Post-Registration)

Save as `segment_identify.jsonnet`:

```jsonnet
local ctx = std.extVar('ctx');

local identity = ctx.identity;
local traits = identity.traits;

{
  userId: identity.id,
  traits: {
    email: traits.email,
    [if std.objectHas(traits, 'name') && std.objectHas(traits.name, 'first') then 'firstName']: traits.name.first,
    [if std.objectHas(traits, 'name') && std.objectHas(traits.name, 'last') then 'lastName']: traits.name.last,
    [if std.objectHas(traits, 'phone') then 'phone']: traits.phone,
    createdAt: identity.created_at,
    orySchemaId: identity.schema_id,
  },
  context: {
    library: {
      name: 'ory-actions',
      version: '1.0.0',
    },
  },
  timestamp: identity.created_at,
}
```

### Track — User Registered (Post-Registration)

Save as `segment_track_registration.jsonnet`:

```jsonnet
local ctx = std.extVar('ctx');

local identity = ctx.identity;
local traits = identity.traits;

{
  userId: identity.id,
  event: 'User Registered',
  properties: {
    email: traits.email,
    registrationMethod: 'password',
    schemaId: identity.schema_id,
    identityState: identity.state,
  },
  context: {
    library: {
      name: 'ory-actions',
      version: '1.0.0',
    },
    traits: {
      email: traits.email,
    },
  },
  timestamp: identity.created_at,
}
```

### Track — User Logged In (Post-Login)

Save as `segment_track_login.jsonnet`:

```jsonnet
local ctx = std.extVar('ctx');

local identity = ctx.identity;
local traits = identity.traits;

{
  userId: identity.id,
  event: 'User Logged In',
  properties: {
    email: traits.email,
    loginMethod: 'password',
    schemaId: identity.schema_id,
  },
  context: {
    library: {
      name: 'ory-actions',
      version: '1.0.0',
    },
    traits: {
      email: traits.email,
    },
  },
}
```

---

## Example Request Payload (Identify)

```json
{
  "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "traits": {
    "email": "jane.doe@example.com",
    "firstName": "Jane",
    "lastName": "Doe",
    "createdAt": "2025-11-15T10:30:00.000Z",
    "orySchemaId": "default"
  },
  "context": {
    "library": {
      "name": "ory-actions",
      "version": "1.0.0"
    }
  },
  "timestamp": "2025-11-15T10:30:00.000Z"
}
```

## Example Response from Segment

```json
{
  "success": true
}
```

---

## Segment Destination Mapping

Once events flow into Segment, you can route them to any connected destination:

| Segment Event | Downstream Example |
|---|---|
| `identify` | Update user in Intercom, HubSpot, Braze |
| `User Registered` | Trigger onboarding email in Customer.io |
| `User Logged In` | Update activity in Amplitude, Mixpanel |

---

## Troubleshooting

| Issue | Resolution |
|---|---|
| 401 Unauthorized | Verify the Base64-encoded Write Key is correct (include trailing colon before encoding). |
| Events not appearing | Check Segment Source Debugger for incoming events. Verify webhook is under the correct flow. |
| Missing traits | Ensure identity schema trait paths match what the Jsonnet template expects. |
| Duplicate identify calls | This is generally fine; Segment de-duplicates by `userId`. |
