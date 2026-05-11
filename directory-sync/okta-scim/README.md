# Okta SCIM Directory Sync for Ory Network

Automatic user provisioning and deprovisioning from Okta to Ory Network using SCIM v2.0.

## Overview

This integration configures Okta as a SCIM identity provider that automatically provisions and deprovisions users in your Ory Network project. When users are created, updated, or deactivated in Okta, the changes are automatically reflected in Ory.

| Feature | Details |
|---------|---------|
| Platform | Okta |
| Protocol | SCIM v2.0 |
| Direction | Okta -> Ory Network |
| Operations | Create, Update, Deactivate users; Push groups |
| Ory Platform | Ory Network (managed cloud) |

## Architecture

```
┌──────────────┐    SCIM v2.0    ┌──────────────┐
│              │  provisioning   │              │
│    Okta      ├────────────────►│  Ory Network │
│              │                 │  (SCIM API)  │
│  (Directory) │  POST /Users    │              │
│              │  PUT /Users/:id │              │
│              │  PATCH /Users   │              │
│              │  DELETE /Users  │              │
└──────────────┘                 └──────────────┘
```

## Prerequisites

- Ory Network project with directory sync (Ory Polis) enabled
- Okta tenant with provisioning capabilities (Okta Lifecycle Management or equivalent)
- Okta administrator role

## Step 1: Get Ory SCIM Configuration

Retrieve the SCIM endpoint and bearer token from Ory:

1. Navigate to **Ory Console > Directory Sync**
2. Click **Add Provider > Okta**
3. Copy the **SCIM Base URL** and **Bearer Token**

```
SCIM Base URL: https://<your-project>.projects.oryapis.com/polis/scim/v2
Bearer Token:  ory_ds_...
```

## Step 2: Configure Okta

### 2a. Create a SCIM Application in Okta

1. Sign in to the [Okta Admin Console](https://admin.okta.com)
2. Navigate to **Applications > Applications**
3. Click **Create App Integration**
4. Select **SWA - Secure Web Authentication** (or SAML/OIDC if also configuring SSO)
5. Name: `Ory Network`
6. Click **Finish**

### 2b. Enable SCIM Provisioning

1. In the Ory Network application, go to the **General** tab
2. Click **Edit** under **App Settings**
3. Enable **SCIM provisioning**
4. Click **Save**

### 2c. Configure SCIM Connection

Go to the **Provisioning** tab and click **Configure API Integration**:

| Field | Value |
|-------|-------|
| SCIM connector base URL | `https://<your-project>.projects.oryapis.com/polis/scim/v2` |
| Unique identifier field for users | `userName` |
| Supported provisioning actions | Create Users, Update User Attributes, Deactivate Users |
| Authentication Mode | HTTP Header |
| Authorization | `Bearer ory_ds_...` |

Click **Test API Credentials** to verify, then **Save**.

### 2d. Configure Provisioning Settings

Under the **Provisioning** tab, go to **To App**:

1. Click **Edit**
2. Enable:
   - **Create Users** - checked
   - **Update User Attributes** - checked
   - **Deactivate Users** - checked
3. Click **Save**

### 2e. Configure Attribute Mappings

Under **Provisioning > To App > Attribute Mappings**, configure:

| Okta Attribute | SCIM Attribute | Apply On |
|---|---|---|
| `userName` | `userName` | Create and Update |
| `email` | `emails[type eq "work"].value` | Create and Update |
| `firstName` | `name.givenName` | Create and Update |
| `lastName` | `name.familyName` | Create and Update |
| `displayName` | `displayName` | Create and Update |
| `externalId` | `externalId` | Create |

#### Optional Enterprise Extension Attributes

| Okta Attribute | SCIM Attribute |
|---|---|
| `department` | `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department` |
| `organization` | `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:organization` |
| `title` | `title` |
| `manager` | `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:manager.displayName` |

### 2f. Assign Users

1. Go to the **Assignments** tab
2. Click **Assign > Assign to People** or **Assign to Groups**
3. Select users or groups to provision
4. Click **Assign** and then **Save and Go Back**

## SCIM API Payloads

### User Creation (Okta sends to Ory)

```json
{
  "schemas": [
    "urn:ietf:params:scim:schemas:core:2.0:User",
    "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"
  ],
  "userName": "jane.doe@company.com",
  "externalId": "00u1abc2def3ghi4jkl5",
  "active": true,
  "name": {
    "givenName": "Jane",
    "familyName": "Doe"
  },
  "displayName": "Jane Doe",
  "emails": [
    {
      "value": "jane.doe@company.com",
      "type": "work",
      "primary": true
    }
  ],
  "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": {
    "department": "Engineering",
    "organization": "Acme Corp"
  }
}
```

### User Update (Okta sends PATCH)

```json
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    {
      "op": "Replace",
      "path": "name.familyName",
      "value": "Smith"
    },
    {
      "op": "Replace",
      "path": "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department",
      "value": "Product"
    }
  ]
}
```

### User Deactivation

```json
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    {
      "op": "Replace",
      "path": "active",
      "value": false
    }
  ]
}
```

## Resulting Ory Identity

When Okta provisions a user, Ory creates an identity like:

```json
{
  "id": "ory-identity-uuid",
  "schema_id": "default",
  "traits": {
    "email": "jane.doe@company.com",
    "name": {
      "first": "Jane",
      "last": "Doe"
    }
  },
  "metadata_public": {
    "directory_sync": {
      "provider": "okta",
      "external_id": "00u1abc2def3ghi4jkl5",
      "department": "Engineering",
      "organization": "Acme Corp",
      "synced_at": "2024-12-15T10:30:00Z"
    }
  },
  "state": "active"
}
```

## Group Push (Optional)

Okta can push group memberships to Ory:

1. In the Ory Network application, go to the **Push Groups** tab
2. Click **Push Groups > Find groups by name**
3. Search for and select groups to push
4. Click **Save**

Group membership is stored in Ory identity metadata and can be used for authorization decisions.

## Identity Schema

Ensure your Ory identity schema accommodates SCIM-provisioned attributes:

```json
{
  "$id": "https://schemas.ory.sh/presets/kratos/identity.scim.schema.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SCIM User",
  "type": "object",
  "properties": {
    "traits": {
      "type": "object",
      "properties": {
        "email": {
          "type": "string",
          "format": "email",
          "title": "Email",
          "ory.sh/kratos": {
            "credentials": {
              "password": { "identifier": true }
            },
            "verification": { "via": "email" },
            "recovery": { "via": "email" }
          }
        },
        "name": {
          "type": "object",
          "properties": {
            "first": { "type": "string" },
            "last": { "type": "string" }
          }
        }
      },
      "required": ["email"],
      "additionalProperties": false
    }
  }
}
```

## Monitoring

### In Okta

Navigate to **Reports > System Log** and filter by:
- `eventType eq "application.provision.user.create_target"`
- `eventType eq "application.provision.user.update_target"`
- `eventType eq "application.provision.user.deactivate_target"`

Or go to **Applications > Ory Network > Provisioning > View Logs**.

### In Ory

```bash
# List SCIM-provisioned identities
ory list identities <project-id> --format json | \
  jq '.identities[] | select(.metadata_public.directory_sync.provider == "okta")'
```

## Troubleshooting

| Issue | Solution |
|-------|---------|
| API credentials test fails | Verify SCIM URL ends with `/scim/v2`; check bearer token is correct |
| Users not provisioning | Ensure users are assigned to the app; check provisioning is enabled |
| Attribute not syncing | Verify the attribute mapping exists and is set to "Create and Update" |
| Duplicate users | Ensure `externalId` mapping is configured for deduplication |
| Deactivated users can still log in | Confirm Ory respects the `active` flag; check identity state |
| Rate limiting | Okta respects `429` responses; Ory will return appropriate rate limit headers |

## References

- [Ory Directory Sync Documentation](https://www.ory.sh/docs/polis/directory-sync)
- [Okta SCIM Provisioning](https://developer.okta.com/docs/guides/scim-provisioning-integration-overview/)
- [Okta SCIM Technical Reference](https://developer.okta.com/docs/reference/scim/)
- [SCIM v2.0 Specification (RFC 7644)](https://datatracker.ietf.org/doc/html/rfc7644)
