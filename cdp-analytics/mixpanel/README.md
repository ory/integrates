# Mixpanel Integration for Ory Network

Send authentication events to Mixpanel when users register or log in via Ory. Uses Ory Actions webhooks to call Mixpanel's Ingestion API.

**Platform:** Ory Network (managed cloud)

---

## Overview

This integration uses Ory Actions **post-registration** and **post-login** webhooks to send events to Mixpanel's Ingestion API. Events track user authentication activity, and profile updates sync identity data to Mixpanel user profiles.

**Flow:**

1. User registers or logs in via Ory.
2. Ory Actions fires a post-registration or post-login webhook.
3. The Jsonnet template maps the identity to a Mixpanel event or profile update payload.
4. Mixpanel ingests the event and/or updates the user profile.

---

## Mixpanel API Details

| Detail | Value |
|---|---|
| **Track Endpoint** | `https://api.mixpanel.com/import` |
| **Profile Endpoint** | `https://api.mixpanel.com/engage#profile-set` |
| **Method** | `POST` |
| **Auth** | Service Account (`Basic` auth with username and secret) or Project Token in body |
| **Content-Type** | `application/json` |

### Authentication Options

**Option A: Service Account (Recommended for server-side)**
- Create a Service Account in Mixpanel: **Settings > Service Accounts > Add Service Account**.
- Use HTTP Basic Auth with the service account username and secret.

**Option B: Project Token**
- Found in **Settings > Project Settings > Project Token**.
- Passed in the event payload as the `token` field.

---

## Ory Actions Webhook Configuration

### Post-Registration: Track + Set Profile

```yaml
selfservice:
  flows:
    registration:
      after:
        password:
          hooks:
            - hook: web_hook
              config:
                url: https://api.mixpanel.com/import
                method: POST
                headers:
                  Content-Type: application/json
                  Authorization: "Basic YOUR_BASE64_SERVICE_ACCOUNT_CREDENTIALS"
                body: file:///etc/config/ory/mixpanel_registration.jsonnet
                can_interrupt: false
                response:
                  ignore: true
```

### Post-Login: Track Event

```yaml
selfservice:
  flows:
    login:
      after:
        password:
          hooks:
            - hook: web_hook
              config:
                url: https://api.mixpanel.com/import
                method: POST
                headers:
                  Content-Type: application/json
                  Authorization: "Basic YOUR_BASE64_SERVICE_ACCOUNT_CREDENTIALS"
                body: file:///etc/config/ory/mixpanel_login.jsonnet
                can_interrupt: false
                response:
                  ignore: true
```

---

## Jsonnet Templates

### Registration Event

Save as `mixpanel_registration.jsonnet`:

```jsonnet
local ctx = std.extVar('ctx');

local identity = ctx.identity;
local traits = identity.traits;

[
  {
    event: 'User Registered',
    properties: {
      distinct_id: identity.id,
      time: identity.created_at,
      '$insert_id': identity.id + '_registration',
      registration_method: 'password',
      schema_id: identity.schema_id,
      '$email': traits.email,
      [if std.objectHas(traits, 'name') && std.objectHas(traits.name, 'first') then '$first_name']: traits.name.first,
      [if std.objectHas(traits, 'name') && std.objectHas(traits.name, 'last') then '$last_name']: traits.name.last,
    },
  },
]
```

### Login Event

Save as `mixpanel_login.jsonnet`:

```jsonnet
local ctx = std.extVar('ctx');

local identity = ctx.identity;
local traits = identity.traits;

[
  {
    event: 'User Logged In',
    properties: {
      distinct_id: identity.id,
      '$insert_id': identity.id + '_login_' + std.toString(std.length(identity.id)),
      login_method: 'password',
      schema_id: identity.schema_id,
      identity_state: identity.state,
      '$email': traits.email,
    },
  },
]
```

### Profile Update (via Engage API)

To set Mixpanel user profile properties on registration, add a second webhook pointing to the Engage endpoint.

Save as `mixpanel_profile.jsonnet`:

```jsonnet
local ctx = std.extVar('ctx');

local identity = ctx.identity;
local traits = identity.traits;

[
  {
    '$distinct_id': identity.id,
    '$token': 'YOUR_MIXPANEL_PROJECT_TOKEN',
    '$set': {
      '$email': traits.email,
      [if std.objectHas(traits, 'name') && std.objectHas(traits.name, 'first') then '$first_name']: traits.name.first,
      [if std.objectHas(traits, 'name') && std.objectHas(traits.name, 'last') then '$last_name']: traits.name.last,
      ory_identity_id: identity.id,
      ory_schema_id: identity.schema_id,
      signup_date: identity.created_at,
    },
    '$set_once': {
      initial_registration_method: 'password',
    },
  },
]
```

Profile update webhook config:

```yaml
# Add as a second hook under registration
- hook: web_hook
  config:
    url: "https://api.mixpanel.com/engage#profile-set"
    method: POST
    headers:
      Content-Type: application/json
    body: file:///etc/config/ory/mixpanel_profile.jsonnet
    can_interrupt: false
    response:
      ignore: true
```

---

## Example Request Payload (Registration Event)

```json
[
  {
    "event": "User Registered",
    "properties": {
      "distinct_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "time": "2025-11-15T10:30:00.000Z",
      "$insert_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890_registration",
      "registration_method": "password",
      "schema_id": "default",
      "$email": "jane.doe@example.com",
      "$first_name": "Jane",
      "$last_name": "Doe"
    }
  }
]
```

## Example Response from Mixpanel

```json
{
  "code": 200,
  "status": "OK",
  "num_records_imported": 1
}
```

---

## Mixpanel Special Properties

Mixpanel recognizes certain reserved property names:

| Mixpanel Property | Purpose |
|---|---|
| `distinct_id` | Unique user identifier (use Ory identity ID) |
| `$email` | User email (used in Mixpanel profiles) |
| `$first_name` | User first name |
| `$last_name` | User last name |
| `$insert_id` | Deduplication key (prevents duplicate events) |
| `time` | Event timestamp (ISO 8601 or Unix epoch) |

---

## Troubleshooting

| Issue | Resolution |
|---|---|
| 401 Unauthorized | Verify service account credentials are correctly Base64-encoded. |
| 400 Bad Request | Ensure the body is a JSON array of event objects. `distinct_id` is required. |
| Events not appearing | Events may take a few minutes. Check Mixpanel's Live View. Ensure `distinct_id` is present. |
| Duplicate events | Add `$insert_id` to each event for deduplication. Mixpanel deduplicates within a 5-day window. |

---

## Data Residency

Mixpanel offers EU data residency. If your project is EU-based, use:

- Events: `https://api-eu.mixpanel.com/import`
- Profiles: `https://api-eu.mixpanel.com/engage#profile-set`
