# mParticle Integration for Ory Network

Send identity and authentication events to mParticle when users register via Ory. Uses Ory Actions webhooks to call mParticle's Events API for server-to-server integration.

**Platform:** Ory Network (managed cloud)

---

## Overview

This integration uses Ory Actions **post-registration** webhooks to send identity events to mParticle's Events API. The server-to-server integration creates user profiles and tracks custom events in mParticle, which can then be forwarded to any connected output (analytics, marketing, data warehouse).

**Flow:**

1. User completes registration in Ory.
2. Ory Actions fires a `post-registration` webhook.
3. The Jsonnet template maps the identity to an mParticle Events API payload.
4. mParticle ingests the event and routes it to configured outputs.

---

## mParticle API Details

| Detail | Value |
|---|---|
| **Endpoint** | `https://s2s.mparticle.com/v2/events` |
| **Method** | `POST` |
| **Auth** | HTTP Basic Auth (API Key as username, API Secret as password) |
| **Content-Type** | `application/json` |

### Getting mParticle API Credentials

1. Log in to mParticle.
2. Go to **Setup > Inputs > Platform > Custom Feed** (or select an existing server input).
3. Click **Issue Keys** to generate an API Key and Secret.
4. Base64-encode them as `API_KEY:API_SECRET`.

```bash
echo -n 'YOUR_API_KEY:YOUR_API_SECRET' | base64
```

---

## Ory Actions Webhook Configuration

### Post-Registration: Identity Event

```yaml
selfservice:
  flows:
    registration:
      after:
        password:
          hooks:
            - hook: web_hook
              config:
                url: https://s2s.mparticle.com/v2/events
                method: POST
                headers:
                  Content-Type: application/json
                  Authorization: "Basic YOUR_BASE64_ENCODED_CREDENTIALS"
                body: file:///etc/config/ory/mparticle_registration.jsonnet
                can_interrupt: false
                response:
                  ignore: true
```

### Post-Login: Authentication Event

```yaml
selfservice:
  flows:
    login:
      after:
        password:
          hooks:
            - hook: web_hook
              config:
                url: https://s2s.mparticle.com/v2/events
                method: POST
                headers:
                  Content-Type: application/json
                  Authorization: "Basic YOUR_BASE64_ENCODED_CREDENTIALS"
                body: file:///etc/config/ory/mparticle_login.jsonnet
                can_interrupt: false
                response:
                  ignore: true
```

---

## Jsonnet Templates

### Registration Event

Save as `mparticle_registration.jsonnet`:

```jsonnet
local ctx = std.extVar('ctx');

local identity = ctx.identity;
local traits = identity.traits;

{
  // Schema version for mParticle Events API
  schema_version: 2,
  environment: 'production',

  user_identities: {
    customer_id: identity.id,
    email: traits.email,
  },

  user_attributes: {
    [if std.objectHas(traits, 'name') && std.objectHas(traits.name, 'first') then '$FirstName']: traits.name.first,
    [if std.objectHas(traits, 'name') && std.objectHas(traits.name, 'last') then '$LastName']: traits.name.last,
    ory_identity_id: identity.id,
    ory_schema_id: identity.schema_id,
    signup_date: identity.created_at,
  },

  events: [
    {
      data: {
        event_name: 'User Registered',
        custom_event_type: 'other',
        custom_attributes: {
          registration_method: 'password',
          schema_id: identity.schema_id,
          identity_state: identity.state,
        },
      },
      event_type: 'custom_event',
    },
  ],
}
```

### Login Event

Save as `mparticle_login.jsonnet`:

```jsonnet
local ctx = std.extVar('ctx');

local identity = ctx.identity;
local traits = identity.traits;

{
  schema_version: 2,
  environment: 'production',

  user_identities: {
    customer_id: identity.id,
    email: traits.email,
  },

  events: [
    {
      data: {
        event_name: 'User Logged In',
        custom_event_type: 'other',
        custom_attributes: {
          login_method: 'password',
          schema_id: identity.schema_id,
          identity_state: identity.state,
        },
      },
      event_type: 'custom_event',
    },
  ],
}
```

---

## Example Request Payload (Registration)

```json
{
  "schema_version": 2,
  "environment": "production",
  "user_identities": {
    "customer_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "email": "jane.doe@example.com"
  },
  "user_attributes": {
    "$FirstName": "Jane",
    "$LastName": "Doe",
    "ory_identity_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "ory_schema_id": "default",
    "signup_date": "2025-11-15T10:30:00.000Z"
  },
  "events": [
    {
      "data": {
        "event_name": "User Registered",
        "custom_event_type": "other",
        "custom_attributes": {
          "registration_method": "password",
          "schema_id": "default",
          "identity_state": "active"
        }
      },
      "event_type": "custom_event"
    }
  ]
}
```

## Example Response from mParticle

```json
// HTTP 202 Accepted (mParticle returns no body on success, just the status code)
```

On error:

```json
{
  "errors": [
    {
      "code": "BAD_REQUEST",
      "message": "Invalid request body"
    }
  ]
}
```

---

## mParticle Identity Mapping

| Ory Field | mParticle Identity/Attribute | Notes |
|---|---|---|
| `identity.id` | `user_identities.customer_id` | Primary identifier |
| `traits.email` | `user_identities.email` | Used for identity resolution |
| `traits.name.first` | `user_attributes.$FirstName` | mParticle reserved attribute |
| `traits.name.last` | `user_attributes.$LastName` | mParticle reserved attribute |
| `identity.schema_id` | `user_attributes.ory_schema_id` | Custom attribute |
| `identity.created_at` | `user_attributes.signup_date` | Custom attribute |

### mParticle Custom Event Types

The `custom_event_type` field accepts:
- `navigation`
- `location`
- `search`
- `transaction`
- `user_content`
- `user_preference`
- `social`
- `other` (used for auth events)

---

## Server-to-Server Integration Details

### Environment

Set `environment` to `production` or `development` depending on your deployment. This controls which mParticle workspace environment receives the data.

### Data Planning

mParticle supports Data Plans to validate incoming events. To set up:

1. Go to **Data Master > Plans > Create Plan**.
2. Add expected events: `User Registered`, `User Logged In`.
3. Define expected attributes for each event.
4. Activate the plan to block or flag non-conforming events.

### Forwarding to Outputs

Once events arrive in mParticle, configure outputs to forward data:

- **Analytics:** Amplitude, Mixpanel, Google Analytics
- **Marketing:** Braze, Iterable, Customer.io
- **Data Warehouse:** Snowflake, BigQuery, Redshift
- **Advertising:** Facebook, Google Ads

---

## Troubleshooting

| Issue | Resolution |
|---|---|
| 401 Unauthorized | Verify API Key and Secret are correctly Base64-encoded with a colon separator. |
| 400 Bad Request | Ensure `schema_version`, `environment`, and `events` are present. Validate JSON structure. |
| Events not appearing | Check mParticle's Live Stream for incoming events. Events may take 1-2 minutes to appear. |
| User attributes not updating | Ensure `user_identities` is present in the payload; mParticle needs it to associate attributes. |

---

## Data Residency

mParticle supports multiple data hosting locations. Use the appropriate endpoint:

| Region | Endpoint |
|---|---|
| US | `https://s2s.mparticle.com/v2/events` |
| EU | `https://s2s.eu1.mparticle.com/v2/events` |
| AU | `https://s2s.au1.mparticle.com/v2/events` |
