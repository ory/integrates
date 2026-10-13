# Segment Integration for Ory Network

Send `identify` and `track` calls to Segment when users register, log in, or update their profile via Ory. Uses Ory Actions webhooks to call Segment's HTTP Tracking API.

**Platform:** Ory Network (managed cloud)
**Docs page:** [ory.com/docs/integrates-with/cdp-analytics/segment](https://www.ory.com/docs/integrates-with/cdp-analytics/segment) — full guide: [ory.com/docs/actions/integrations/segment](https://www.ory.com/docs/actions/integrations/segment)

---

## Overview

This integration uses Ory Actions **post-registration**, **post-login**, and **post-settings** webhooks to send events to Segment's HTTP Tracking API. Registration triggers an `identify` call (to create or update the user profile in Segment) and a `track` call ("User Registered"). Login triggers a `track` call ("User Logged In"). Profile changes trigger an `identify` call.

You can run it two ways:

- **With the reference handler** in [`webhook/`](webhook/) (recommended). The actions in [`ory-actions.yaml`](ory-actions.yaml) send [`jsonnet/event.jsonnet`](jsonnet/event.jsonnet) to the handler, which calls Segment.
- **Directly**, with one action per Segment call and the Jsonnet templates below. No handler to run.

**Flow:**

1. User registers, signs in, or changes their profile via Ory.
2. Ory Actions fires the matching webhook in the background (`response.ignore: true`), so the flow doesn't wait for Segment.
3. The Jsonnet template maps the identity to the request body.
4. Segment receives and routes the event to connected destinations.

---

## Segment API Details

| Detail | Value |
|---|---|
| **Endpoint** | `https://api.segment.io/v1/identify` or `https://api.segment.io/v1/track` |
| **Method** | `POST` |
| **Auth** | HTTP Basic Auth (Write Key as username, empty password) |
| **Content-Type** | `application/json` |

To get your Write Key: **Segment > Sources > Your Source > Settings > API Keys**.

---

## Option A: Reference handler

```bash
cd webhook/
cp .env.example .env
# Fill in ORY_WEBHOOK_SECRET and SEGMENT_WRITE_KEY.
npm install
npm start
```

The handler exposes `POST /segment/registration`, `POST /segment/login`, and `POST /segment/settings`, plus `GET /health`. Configure the actions from [`ory-actions.yaml`](ory-actions.yaml) and set `ORY_WEBHOOK_SECRET` to the `X-Webhook-Secret` value in the action's `auth` block. The handler takes the client IP address from the `True-Client-Ip` request header that Ory Network sets; Ory doesn't forward `X-Forwarded-For` to webhooks.

## Option B: Call Segment directly

Ory Actions authenticate with `basic_auth` or `api_key` only. Use `basic_auth` with the Write Key as `user` and an empty `password`. Ory Network ignores a webhook's `headers` setting, so don't put the `Authorization` header there.

Encode each template with `base64 < <file>.jsonnet | tr -d '\n'` and set it as `body: base64://<encoded>`. Ory Network doesn't accept `file://` URLs.

### Post-registration: identify + track

Attach the actions to the list of each sign-up method you enable. Ory runs the flow-level `registration.after.hooks` list only for methods without their own list, and on Ory Network the password list already contains `session`. Keep `session` last:

```yaml
selfservice:
  flows:
    registration:
      after:
        password: # Repeat for oidc, code, passkey, and other sign-up methods.
          hooks:
            - hook: web_hook
              config:
                url: https://api.segment.io/v1/identify
                method: POST
                body: base64://<base64-encoded segment_identify.jsonnet>
                auth:
                  type: basic_auth
                  config:
                    user: <your-segment-write-key>
                    password: ""
                response:
                  ignore: true
            - hook: web_hook
              config:
                url: https://api.segment.io/v1/track
                method: POST
                body: base64://<base64-encoded segment_track_registration.jsonnet>
                auth:
                  type: basic_auth
                  config:
                    user: <your-segment-write-key>
                    password: ""
                response:
                  ignore: true
            - hook: session
```

These actions run after Ory saves the identity, so `ctx.identity.id` is the real identity ID. Don't add `response.parse: true`: a parsing registration action runs before the identity is saved, when its ID is `00000000-0000-0000-0000-000000000000`.

### Post-login: track

```yaml
selfservice:
  flows:
    login:
      after:
        password: # Repeat for oidc, code, passkey, and other sign-in methods.
          hooks:
            - hook: web_hook
              config:
                url: https://api.segment.io/v1/track
                method: POST
                body: base64://<base64-encoded segment_track_login.jsonnet>
                auth:
                  type: basic_auth
                  config:
                    user: <your-segment-write-key>
                    password: ""
                response:
                  ignore: true
```

---

## Jsonnet Templates

Ory passes the context as the `ctx` argument of the template function. Jsonnet fails on a field that doesn't exist, and a failing template drops the request, so read optional traits and headers with `std.get`.

### Identify (Post-Registration)

Save as `segment_identify.jsonnet`:

```jsonnet
function(ctx)
  local traits = ctx.identity.traits;
  local name = std.get(traits, 'name', null);
  local nameFields = if name == null then {} else name;
  std.prune({
    userId: ctx.identity.id,
    traits: {
      email: std.get(traits, 'email', null),
      firstName: std.get(nameFields, 'first', null),
      lastName: std.get(nameFields, 'last', null),
      phone: std.get(traits, 'phone', null),
      createdAt: ctx.identity.created_at,
      orySchemaId: ctx.identity.schema_id,
    },
    context: {
      library: { name: 'ory-actions', version: '1.0.0' },
      ip: std.get(ctx.request_headers, 'True-Client-Ip', [null])[0],
    },
    timestamp: ctx.identity.created_at,
  })
```

### Track — User Registered (Post-Registration)

Save as `segment_track_registration.jsonnet`:

```jsonnet
function(ctx)
  std.prune({
    userId: ctx.identity.id,
    event: 'User Registered',
    properties: {
      schemaId: ctx.identity.schema_id,
      identityState: ctx.identity.state,
      flowId: ctx.flow.id,
    },
    context: {
      library: { name: 'ory-actions', version: '1.0.0' },
      ip: std.get(ctx.request_headers, 'True-Client-Ip', [null])[0],
    },
    timestamp: ctx.identity.created_at,
  })
```

### Track — User Logged In (Post-Login)

Save as `segment_track_login.jsonnet`:

```jsonnet
function(ctx)
  std.prune({
    userId: ctx.identity.id,
    event: 'User Logged In',
    properties: {
      loginMethods: [m.method for m in std.get(ctx.session, 'authentication_methods', [])],
      flowId: ctx.flow.id,
    },
    context: {
      library: { name: 'ory-actions', version: '1.0.0' },
      ip: std.get(ctx.request_headers, 'True-Client-Ip', [null])[0],
    },
  })
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
| 401 Unauthorized | Verify the Write Key in the `basic_auth` `user` field (direct path) or `SEGMENT_WRITE_KEY` (handler). |
| Events not appearing | Check Segment Source Debugger for incoming events. Verify the action is in the method-specific list, for example `registration.after.password.hooks`, not only in the flow-level `after.hooks`. |
| Missing traits or no request at all | A template that reads a missing field fails and Ory drops the request. Read optional traits with `std.get`. |
| Brief Segment errors | Ory retries a delivery that fails or receives 429 or a 5xx status other than 501, up to three attempts within a few seconds. Longer outages drop the event. |
| Duplicate identify calls | This is generally fine; Segment de-duplicates retries by their stable `messageId`. |

The handler acknowledges successful vendor calls with `200` and returns `502` on failure so Ory can retry without delaying the user flow. Retries are bounded; use a durable queue for longer outages. Segment retries reuse message IDs; Pipedrive activity retries may produce duplicates after an ambiguous timeout.
