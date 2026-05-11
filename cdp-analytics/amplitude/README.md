# Amplitude Integration for Ory Network

Send authentication events and sync user properties to Amplitude when users log in or register via Ory. Uses Ory Actions webhooks to call Amplitude's HTTP V2 API.

**Platform:** Ory Network (managed cloud)

---

## Overview

This integration uses Ory Actions **post-login** and **post-registration** webhooks to send events to Amplitude's HTTP V2 API. Login events track authentication activity, while registration events record new user signups and set initial user properties.

**Flow:**

1. User logs in or registers via Ory.
2. Ory Actions fires a post-login or post-registration webhook.
3. The Jsonnet template maps the identity to an Amplitude event payload.
4. Amplitude ingests the event and updates the user profile.

---

## Amplitude API Details

| Detail | Value |
|---|---|
| **Endpoint** | `https://api2.amplitude.com/2/httpapi` |
| **Method** | `POST` |
| **Auth** | API Key in the request body (no auth header required) |
| **Content-Type** | `application/json` |

Get your API Key from **Amplitude > Settings > Projects > Your Project > General > API Key**.

---

## Ory Actions Webhook Configuration

### Post-Login: Track Login Event

```yaml
selfservice:
  flows:
    login:
      after:
        password:
          hooks:
            - hook: web_hook
              config:
                url: https://api2.amplitude.com/2/httpapi
                method: POST
                headers:
                  Content-Type: application/json
                body: file:///etc/config/ory/amplitude_login.jsonnet
                can_interrupt: false
                response:
                  ignore: true
```

### Post-Registration: Track Registration Event

```yaml
selfservice:
  flows:
    registration:
      after:
        password:
          hooks:
            - hook: web_hook
              config:
                url: https://api2.amplitude.com/2/httpapi
                method: POST
                headers:
                  Content-Type: application/json
                body: file:///etc/config/ory/amplitude_registration.jsonnet
                can_interrupt: false
                response:
                  ignore: true
```

---

## Jsonnet Templates

### Login Event

Save as `amplitude_login.jsonnet`:

```jsonnet
local ctx = std.extVar('ctx');

local identity = ctx.identity;
local traits = identity.traits;

{
  api_key: 'YOUR_AMPLITUDE_API_KEY',
  events: [
    {
      user_id: identity.id,
      event_type: 'User Logged In',
      event_properties: {
        login_method: 'password',
        schema_id: identity.schema_id,
        identity_state: identity.state,
      },
      user_properties: {
        '$set': {
          email: traits.email,
          [if std.objectHas(traits, 'name') && std.objectHas(traits.name, 'first') then 'first_name']: traits.name.first,
          [if std.objectHas(traits, 'name') && std.objectHas(traits.name, 'last') then 'last_name']: traits.name.last,
          ory_schema_id: identity.schema_id,
        },
      },
      platform: 'server',
      language: 'en',
    },
  ],
}
```

### Registration Event

Save as `amplitude_registration.jsonnet`:

```jsonnet
local ctx = std.extVar('ctx');

local identity = ctx.identity;
local traits = identity.traits;

{
  api_key: 'YOUR_AMPLITUDE_API_KEY',
  events: [
    {
      user_id: identity.id,
      event_type: 'User Registered',
      event_properties: {
        registration_method: 'password',
        schema_id: identity.schema_id,
      },
      user_properties: {
        '$set': {
          email: traits.email,
          [if std.objectHas(traits, 'name') && std.objectHas(traits.name, 'first') then 'first_name']: traits.name.first,
          [if std.objectHas(traits, 'name') && std.objectHas(traits.name, 'last') then 'last_name']: traits.name.last,
          ory_schema_id: identity.schema_id,
          signup_date: identity.created_at,
        },
        '$setOnce': {
          initial_registration_method: 'password',
          initial_schema_id: identity.schema_id,
        },
      },
      platform: 'server',
      language: 'en',
    },
  ],
}
```

---

## Example Request Payload (Login)

```json
{
  "api_key": "YOUR_AMPLITUDE_API_KEY",
  "events": [
    {
      "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "event_type": "User Logged In",
      "event_properties": {
        "login_method": "password",
        "schema_id": "default",
        "identity_state": "active"
      },
      "user_properties": {
        "$set": {
          "email": "jane.doe@example.com",
          "first_name": "Jane",
          "last_name": "Doe",
          "ory_schema_id": "default"
        }
      },
      "platform": "server",
      "language": "en"
    }
  ]
}
```

## Example Response from Amplitude

```json
{
  "code": 200,
  "server_upload_time": "2025-11-15T10:30:00.000Z",
  "payload_size_bytes": 432,
  "events_ingested": 1
}
```

---

## User Property Mapping

| Ory Field | Amplitude User Property | Operator |
|---|---|---|
| `identity.id` | `user_id` | (top-level) |
| `traits.email` | `email` | `$set` |
| `traits.name.first` | `first_name` | `$set` |
| `traits.name.last` | `last_name` | `$set` |
| `identity.schema_id` | `ory_schema_id` | `$set` |
| `identity.created_at` | `signup_date` | `$set` |
| Registration method | `initial_registration_method` | `$setOnce` |

### Amplitude User Property Operators

- `$set` — Always overwrite with the latest value.
- `$setOnce` — Only set if not already set (useful for initial attribution).
- `$add` — Increment a numeric property.
- `$append` — Append to a list property.

---

## Troubleshooting

| Issue | Resolution |
|---|---|
| 400 Bad Request | Verify the `api_key` is correct. Check that `events` is a non-empty array. |
| 429 Rate Limited | Amplitude's HTTP V2 API allows up to 1000 events/second. Batch events if needed. |
| Events not appearing | Check Amplitude's User Look-Up by `user_id` (the Ory identity ID). Events may take a few minutes to appear. |
| Missing user properties | Verify the `$set` operator is used correctly in `user_properties`. |

---

## Security Note

The Amplitude API key is included in the Jsonnet template body, not in the webhook URL or headers. This key is a **write-only** key and cannot be used to read data from Amplitude. However, treat it as a secret and do not expose it in client-side code.
