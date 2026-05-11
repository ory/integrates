# Salesforce CRM Integration for Ory Network

Create Salesforce Leads or Contacts automatically when users register in Ory. Uses Ory Actions webhooks with OAuth2 service-to-service authentication to call the Salesforce REST API.

**Platform:** Ory Network (managed cloud)

---

## Overview

This integration uses an Ory Actions **post-registration** webhook to call the Salesforce REST API. Because Salesforce requires OAuth2 authentication, the integration uses a Salesforce Connected App with the **Client Credentials** flow (server-to-server, no user interaction).

**Flow:**

1. User completes registration in Ory.
2. Ory Actions fires a `post-registration` webhook to an intermediary function.
3. The intermediary authenticates to Salesforce via OAuth2 Client Credentials.
4. The intermediary creates a Lead or Contact in Salesforce using the REST API.

> **Note:** Because Salesforce requires a two-step process (obtain OAuth token, then call API), you need a lightweight intermediary service (e.g., AWS Lambda, Cloudflare Worker, or a small HTTP proxy) that handles the OAuth2 token exchange. Ory Actions webhooks support static auth headers, not dynamic OAuth2 token flows.

---

## Salesforce API Details

| Detail | Value |
|---|---|
| **Token Endpoint** | `https://YOUR_INSTANCE.salesforce.com/services/oauth2/token` |
| **Lead Endpoint** | `https://YOUR_INSTANCE.salesforce.com/services/data/v59.0/sobjects/Lead/` |
| **Contact Endpoint** | `https://YOUR_INSTANCE.salesforce.com/services/data/v59.0/sobjects/Contact/` |
| **Auth Method** | OAuth2 Client Credentials (Connected App) |
| **Content-Type** | `application/json` |

### Setting Up a Salesforce Connected App

1. In Salesforce Setup, go to **App Manager > New Connected App**.
2. Enable **OAuth Settings**.
3. Set the callback URL to `https://login.salesforce.com/services/oauth2/callback` (not used for client credentials but required).
4. Select scopes: `api`, `refresh_token`.
5. Under **OAuth Policies**, enable "Client Credentials Flow".
6. Assign a **Run As** user with permissions to create Leads/Contacts.
7. Note the **Consumer Key** and **Consumer Secret**.

### Obtaining an Access Token (Server-to-Server)

```bash
curl -X POST https://YOUR_INSTANCE.salesforce.com/services/oauth2/token \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CONSUMER_KEY" \
  -d "client_secret=YOUR_CONSUMER_SECRET"
```

Response:

```json
{
  "access_token": "00D...",
  "instance_url": "https://yourorg.my.salesforce.com",
  "id": "https://login.salesforce.com/id/00Dxx.../005xx...",
  "token_type": "Bearer",
  "issued_at": "1700000000000"
}
```

---

## Architecture Options

### Option A: Direct Webhook with Token Proxy (Recommended)

Deploy a small proxy service that:
1. Receives the webhook from Ory.
2. Obtains/caches a Salesforce OAuth2 token.
3. Forwards the identity data to Salesforce.

### Option B: Direct Webhook with Pre-fetched Token

If you manage token rotation externally, you can configure the webhook with a static Bearer token. You will need to rotate it before it expires (tokens last ~2 hours by default).

---

## Ory Actions Webhook Configuration

### For Option A (via proxy)

```yaml
selfservice:
  flows:
    registration:
      after:
        password:
          hooks:
            - hook: web_hook
              config:
                url: https://your-proxy.example.com/ory-to-salesforce
                method: POST
                headers:
                  Content-Type: application/json
                  X-Proxy-Secret: "YOUR_SHARED_SECRET"
                body: file:///etc/config/ory/salesforce_lead.jsonnet
                can_interrupt: false
                response:
                  ignore: true
```

### For Option B (direct, with static token)

```yaml
selfservice:
  flows:
    registration:
      after:
        password:
          hooks:
            - hook: web_hook
              config:
                url: https://YOUR_INSTANCE.salesforce.com/services/data/v59.0/sobjects/Lead/
                method: POST
                headers:
                  Content-Type: application/json
                  Authorization: "Bearer YOUR_SALESFORCE_ACCESS_TOKEN"
                body: file:///etc/config/ory/salesforce_lead.jsonnet
                can_interrupt: false
                response:
                  ignore: true
```

---

## Jsonnet Body Template — Create Lead

Save as `salesforce_lead.jsonnet`:

```jsonnet
local ctx = std.extVar('ctx');

local identity = ctx.identity;
local traits = identity.traits;

// Split name if stored as a single field, or use first/last directly
local firstName = if std.objectHas(traits, 'name') && std.objectHas(traits.name, 'first')
  then traits.name.first
  else '';

local lastName = if std.objectHas(traits, 'name') && std.objectHas(traits.name, 'last')
  then traits.name.last
  else traits.email;  // Salesforce requires LastName; fall back to email

{
  FirstName: firstName,
  LastName: lastName,
  Email: traits.email,
  Company: if std.objectHas(traits, 'company') then traits.company else '[Not Provided]',
  [if std.objectHas(traits, 'phone') then 'Phone']: traits.phone,
  [if std.objectHas(traits, 'title') then 'Title']: traits.title,
  LeadSource: 'Ory Registration',
  Description: 'Auto-created from Ory identity ' + identity.id,
}
```

## Jsonnet Body Template — Create Contact

Save as `salesforce_contact.jsonnet`:

```jsonnet
local ctx = std.extVar('ctx');

local identity = ctx.identity;
local traits = identity.traits;

local firstName = if std.objectHas(traits, 'name') && std.objectHas(traits.name, 'first')
  then traits.name.first
  else '';

local lastName = if std.objectHas(traits, 'name') && std.objectHas(traits.name, 'last')
  then traits.name.last
  else traits.email;

{
  FirstName: firstName,
  LastName: lastName,
  Email: traits.email,
  [if std.objectHas(traits, 'phone') then 'Phone']: traits.phone,
  [if std.objectHas(traits, 'title') then 'Title']: traits.title,
  // AccountId is required if your org mandates it
  // AccountId: 'YOUR_DEFAULT_ACCOUNT_ID',
  Description: 'Auto-created from Ory identity ' + identity.id,
}
```

---

## Example Request Payload (Lead)

```json
{
  "FirstName": "Jane",
  "LastName": "Doe",
  "Email": "jane.doe@example.com",
  "Company": "Acme Corp",
  "Phone": "+1-555-0199",
  "LeadSource": "Ory Registration",
  "Description": "Auto-created from Ory identity a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

## Example Response from Salesforce

```json
{
  "id": "00Qxx000001abcDEF",
  "success": true,
  "errors": []
}
```

---

## Example Proxy Service (Node.js / Cloudflare Worker)

A minimal proxy that handles OAuth2 token management:

```javascript
// Pseudocode for the proxy
const SALESFORCE_TOKEN_URL = 'https://YOUR_INSTANCE.salesforce.com/services/oauth2/token';
const SALESFORCE_API_URL = 'https://YOUR_INSTANCE.salesforce.com/services/data/v59.0/sobjects/Lead/';
const CLIENT_ID = process.env.SF_CLIENT_ID;
const CLIENT_SECRET = process.env.SF_CLIENT_SECRET;

let cachedToken = null;
let tokenExpiry = 0;

async function getSalesforceToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const response = await fetch(SALESFORCE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`,
  });
  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + 7000 * 1000; // ~2 hours minus buffer
  return cachedToken;
}

async function handleWebhook(request) {
  const body = await request.json();
  const token = await getSalesforceToken();

  const sfResponse = await fetch(SALESFORCE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  return new Response(JSON.stringify(await sfResponse.json()), { status: sfResponse.status });
}
```

---

## Troubleshooting

| Issue | Resolution |
|---|---|
| `INVALID_SESSION_ID` | OAuth token expired. Ensure your proxy refreshes tokens. |
| `REQUIRED_FIELD_MISSING` | Salesforce requires `LastName` for Leads/Contacts and `Company` for Leads. Check Jsonnet fallback values. |
| `DUPLICATES_DETECTED` | Enable duplicate rules in Salesforce or use upsert with an External ID field. |
| Webhook timeout | Salesforce API can be slow. Increase Ory webhook timeout or use async processing in the proxy. |

---

## Upsert Pattern (Avoid Duplicates)

To update existing records instead of creating duplicates, use Salesforce's upsert endpoint with an External ID:

1. Create a custom External ID field on Lead/Contact (e.g., `Ory_Identity_Id__c`).
2. Use the upsert endpoint: `PATCH /services/data/v59.0/sobjects/Lead/Ory_Identity_Id__c/{ory_identity_id}`.
3. Update the Jsonnet template to include `Ory_Identity_Id__c: identity.id`.
