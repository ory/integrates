# OneLogin SCIM Directory Sync for Ory Network

Automatic user provisioning and deprovisioning from OneLogin to Ory Network using SCIM v2.0.

## Overview

This integration configures OneLogin to automatically provision and deprovision users in your Ory Network project via SCIM v2.0. When users are created, updated, or suspended in OneLogin, those changes are reflected in Ory.

| Feature | Details |
|---------|---------|
| Platform | OneLogin |
| Protocol | SCIM v2.0 |
| Direction | OneLogin -> Ory Network |
| Operations | Create, Update, Deactivate, Delete users |
| Ory Platform | Ory Network (managed cloud) |

## Architecture

```
┌──────────────┐    SCIM v2.0    ┌──────────────┐
│              │  provisioning   │              │
│  OneLogin    ├────────────────►│  Ory Network │
│              │                 │  (SCIM API)  │
│  (Directory) │  POST /Users    │              │
│              │  PUT /Users/:id │              │
│              │  PATCH /Users   │              │
│              │  DELETE /Users  │              │
└──────────────┘                 └──────────────┘
```

## Prerequisites

- Ory Network project with directory sync (Ory Polis) enabled
- OneLogin account with provisioning capabilities
- OneLogin super administrator or account administrator role

## Step 1: Get Ory SCIM Configuration

1. Navigate to **Ory Console > Directory Sync**
2. Click **Add Provider > OneLogin**
3. Copy the **SCIM Base URL** and **Bearer Token**

```
SCIM Base URL: https://<your-project>.projects.oryapis.com/polis/scim/v2
Bearer Token:  ory_ds_...
```

## Step 2: Configure OneLogin

### 2a. Add a SCIM Application

1. Sign in to the [OneLogin Admin Portal](https://admin.us.onelogin.com)
2. Navigate to **Applications > Applications**
3. Click **Add App**
4. Search for **SCIM Provisioner with SAML (SCIM v2 Core)** or **SCIM Provisioner with SAML (SCIM v2 Enterprise)**
5. Name the app `Ory Network`
6. Click **Save**

### 2b. Configure SCIM Connection

Go to the **Configuration** tab:

| Field | Value |
|-------|-------|
| SCIM Base URL | `https://<your-project>.projects.oryapis.com/polis/scim/v2` |
| SCIM Bearer Token | `ory_ds_...` |
| SCIM JSON Template | See below |
| API Connection | Enabled |

Click **Enable** under API Connection, then **Save**.

### SCIM JSON Template

```json
{
  "schemas": [
    "urn:ietf:params:scim:schemas:core:2.0:User",
    "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"
  ],
  "userName": "{$user.email}",
  "externalId": "{$user.id}",
  "name": {
    "givenName": "{$user.firstname}",
    "familyName": "{$user.lastname}"
  },
  "displayName": "{$user.display_name}",
  "emails": [
    {
      "value": "{$user.email}",
      "type": "work",
      "primary": true
    }
  ],
  "active": "{$user.status}",
  "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": {
    "department": "{$user.department}",
    "organization": "{$user.company}"
  }
}
```

### 2c. Configure Provisioning

Go to the **Provisioning** tab:

1. Enable provisioning: **Checked**
2. Under **Workflow**:
   - **Create user** — Checked
   - **Delete user** — Checked (or Suspend, depending on your policy)
   - **Update user** — Checked
   - **Suspend user** — Checked
3. Under **Entitlements**, configure as needed
4. Click **Save**

### 2d. Configure Attribute Mappings (Parameters)

Go to the **Parameters** tab and verify or add mappings:

| OneLogin Field | SCIM Attribute | Include in SCIM |
|---|---|---|
| Email | `userName` | Yes |
| Email | `emails[type eq "work"].value` | Yes |
| First Name | `name.givenName` | Yes |
| Last Name | `name.familyName` | Yes |
| Display Name | `displayName` | Yes |
| OneLogin ID | `externalId` | Yes |
| Department | `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department` | Yes |
| Company | `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:organization` | Yes |

### 2e. Assign Users

1. Go to the **Users** tab (or use **Access > Roles**)
2. Assign individual users or assign via roles
3. Provisioning triggers automatically when a user is assigned

## SCIM API Payloads

### User Creation

```json
{
  "schemas": [
    "urn:ietf:params:scim:schemas:core:2.0:User",
    "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"
  ],
  "userName": "jane.doe@company.com",
  "externalId": "12345678",
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

### User Suspension

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
      "provider": "onelogin",
      "external_id": "12345678",
      "department": "Engineering",
      "organization": "Acme Corp",
      "synced_at": "2024-12-15T10:30:00Z"
    }
  },
  "state": "active"
}
```

## Monitoring

### In OneLogin

- Navigate to **Activity > Events** and filter by provisioning events
- Check **Applications > Ory Network > Provisioning > Recent Events** for per-app logs

### In Ory

```bash
ory list identities <project-id> --format json | \
  jq '.identities[] | select(.metadata_public.directory_sync.provider == "onelogin")'
```

## Troubleshooting

| Issue | Solution |
|-------|---------|
| API Connection test fails | Verify the SCIM Base URL and Bearer Token; ensure no trailing slash |
| Users not provisioning | Check that provisioning is enabled and users are assigned to the app |
| Attributes missing | Review the Parameters tab and SCIM JSON Template |
| User suspended but can still log in | Verify the `active` field mapping and check Ory identity state |
| Provisioning errors in logs | Check OneLogin Events for detailed error messages |
| Rate limiting (429) | OneLogin backs off automatically; check if too many users assigned at once |

## References

- [Ory Directory Sync Documentation](https://www.ory.sh/docs/polis/directory-sync)
- [OneLogin SCIM Provisioning](https://developers.onelogin.com/scim)
- [OneLogin SCIM Provisioner App Configuration](https://onelogin.service-now.com/kb_view_customer.do?sysparm_article=KB0010332)
- [SCIM v2.0 Specification (RFC 7644)](https://datatracker.ietf.org/doc/html/rfc7644)
