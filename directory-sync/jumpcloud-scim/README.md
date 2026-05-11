# JumpCloud SCIM Directory Sync for Ory Network

Automatic user provisioning and deprovisioning from JumpCloud to Ory Network using SCIM v2.0.

## Overview

This integration configures JumpCloud to automatically provision and deprovision users in your Ory Network project via SCIM v2.0. When users are created, updated, or suspended in JumpCloud, those changes are reflected in Ory.

| Feature | Details |
|---------|---------|
| Platform | JumpCloud |
| Protocol | SCIM v2.0 |
| Direction | JumpCloud -> Ory Network |
| Operations | Create, Update, Deactivate, Delete users; Group sync |
| Ory Platform | Ory Network (managed cloud) |

## Architecture

```
┌──────────────┐    SCIM v2.0    ┌──────────────┐
│              │  provisioning   │              │
│  JumpCloud   ├────────────────►│  Ory Network │
│              │                 │  (SCIM API)  │
│  (Directory) │  POST /Users    │              │
│              │  PUT /Users/:id │              │
│              │  PATCH /Users   │              │
│              │  DELETE /Users  │              │
└──────────────┘                 └──────────────┘
```

## Prerequisites

- Ory Network project with directory sync (Ory Polis) enabled
- JumpCloud account with Identity Management capabilities
- JumpCloud administrator role

## Step 1: Get Ory SCIM Configuration

1. Navigate to **Ory Console > Directory Sync**
2. Click **Add Provider > JumpCloud**
3. Copy the **SCIM Base URL** and **Bearer Token**

```
SCIM Base URL: https://<your-project>.projects.oryapis.com/polis/scim/v2
Bearer Token:  ory_ds_...
```

## Step 2: Configure JumpCloud

### 2a. Add a SCIM Application

1. Sign in to the [JumpCloud Admin Portal](https://console.jumpcloud.com)
2. Navigate to **SSO Applications**
3. Click **+ Add New Application**
4. Search for **Custom SCIM** (or select a SCIM-compatible connector)
5. Select **Custom SCIM 2.0 Application**
6. Name: `Ory Network`
7. Click **Next**

### 2b. Configure SCIM Settings

In the **Identity Management** tab:

| Field | Value |
|-------|-------|
| Base URL | `https://<your-project>.projects.oryapis.com/polis/scim/v2` |
| Token Key | `ory_ds_...` |
| Test User Email | A valid email for connection testing |

Click **Test Connection** to verify, then **Activate**.

### 2c. Configure Provisioning Actions

In the **Identity Management** tab, enable:

- **User provisioning** — Group membership to control who is provisioned
- **User deprovisioning** — Automatically deactivate/delete when removed from group
- **User attribute updates** — Sync attribute changes

### 2d. Configure Attribute Mappings

JumpCloud provides default SCIM attribute mappings. Verify or customize:

| JumpCloud Attribute | SCIM Attribute | Sync Direction |
|---|---|---|
| `username` | `userName` | JumpCloud -> Ory |
| `email` | `emails[type eq "work"].value` | JumpCloud -> Ory |
| `firstname` | `name.givenName` | JumpCloud -> Ory |
| `lastname` | `name.familyName` | JumpCloud -> Ory |
| `displayname` | `displayName` | JumpCloud -> Ory |
| `JumpCloud User ID` | `externalId` | JumpCloud -> Ory |
| `department` | `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department` | JumpCloud -> Ory |
| `jobTitle` | `title` | JumpCloud -> Ory |
| `company` | `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:organization` | JumpCloud -> Ory |

### 2e. Assign User Groups

1. Go to **User Groups** in JumpCloud
2. Create or select a group (e.g., "Ory Network Users")
3. Add users to the group
4. In the Ory Network application settings, bind the user group
5. Users in the bound group will be provisioned to Ory

## SCIM API Payloads

### User Creation

```json
{
  "schemas": [
    "urn:ietf:params:scim:schemas:core:2.0:User",
    "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"
  ],
  "userName": "jane.doe@company.com",
  "externalId": "5f3c...jumpcloud-user-id",
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

### User Update

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

## Resulting Ory Identity

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
      "provider": "jumpcloud",
      "external_id": "5f3c...jumpcloud-user-id",
      "department": "Engineering",
      "organization": "Acme Corp",
      "synced_at": "2024-12-15T10:30:00Z"
    }
  },
  "state": "active"
}
```

## Group Sync

JumpCloud can sync user group memberships to Ory. Group information is stored in identity metadata and can be used for role-based access control.

### JumpCloud Group Push Configuration

1. In the Ory Network application, go to **Identity Management > Group Management**
2. Enable **Push groups**
3. Select which JumpCloud groups to sync
4. Group memberships are sent as SCIM Group resources

### Resulting Group Data in Ory

```json
{
  "metadata_public": {
    "directory_sync": {
      "provider": "jumpcloud",
      "groups": ["engineering", "platform-team"],
      "synced_at": "2024-12-15T10:30:00Z"
    }
  }
}
```

## Monitoring

### In JumpCloud

- Navigate to **Directory Insights > Events** and filter by SCIM/provisioning events
- Check the Ory Network application's **Identity Management** tab for provisioning status

### In Ory

```bash
ory list identities <project-id> --format json | \
  jq '.identities[] | select(.metadata_public.directory_sync.provider == "jumpcloud")'
```

## Troubleshooting

| Issue | Solution |
|-------|---------|
| Test Connection fails | Verify SCIM Base URL and Token; ensure directory sync is enabled in Ory |
| Users not provisioning | Ensure users are in a group bound to the application |
| Attribute not syncing | Check attribute mapping configuration in Identity Management |
| Deactivated users can still log in | Verify the `active` attribute is mapped correctly |
| Group sync not working | Ensure Group Management is enabled and groups are pushed |
| Rate limiting | JumpCloud respects 429 responses and backs off automatically |

## References

- [Ory Directory Sync Documentation](https://www.ory.sh/docs/polis/directory-sync)
- [JumpCloud SCIM Integration Guide](https://support.jumpcloud.com/s/article/getting-started-scim-integration)
- [JumpCloud Identity Management](https://support.jumpcloud.com/s/article/understanding-identity-management)
- [SCIM v2.0 Specification (RFC 7644)](https://datatracker.ietf.org/doc/html/rfc7644)
