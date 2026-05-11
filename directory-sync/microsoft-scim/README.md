# Microsoft Entra ID (Azure AD) SCIM Directory Sync for Ory Network

Automatic user provisioning and deprovisioning from Microsoft Entra ID to Ory Network using SCIM v2.0.

## Overview

Ory Network supports SCIM (System for Cross-domain Identity Management) v2.0 for directory synchronization. This integration configures Microsoft Entra ID (formerly Azure AD) to automatically provision and deprovision users in your Ory Network project when changes occur in your Entra directory.

| Feature | Details |
|---------|---------|
| Platform | Microsoft Entra ID (Azure AD) |
| Protocol | SCIM v2.0 |
| Direction | Entra ID -> Ory Network |
| Operations | Create, Update, Disable, Delete users |
| Group sync | Supported (maps to Ory identity metadata) |
| Ory Platform | Ory Network (managed cloud) |
| Ory Docs | [Directory Sync — Azure](https://www.ory.sh/docs/polis/directory-sync/providers/azure) |

## Architecture

```
┌──────────────────┐    SCIM v2.0    ┌──────────────┐
│                  │  provisioning   │              │
│  Microsoft       ├────────────────►│  Ory Network │
│  Entra ID        │                 │  (SCIM API)  │
│                  │  POST /Users    │              │
│  (Directory)     │  PUT /Users/:id │              │
│                  │  PATCH /Users   │              │
│                  │  DELETE /Users  │              │
└──────────────────┘                 └──────────────┘
```

## Prerequisites

- Ory Network project with **Ory Polis** (directory sync feature) enabled
- Microsoft Entra ID (Azure AD) tenant with P1 or P2 license (required for SCIM provisioning)
- Entra ID global administrator or application administrator role

## Step 1: Get Ory SCIM Configuration

### Retrieve SCIM Endpoint and Token from Ory

```bash
# Get the SCIM endpoint URL and bearer token from Ory
ory get project <project-id> --format json | jq '.services.polis.config.directory_sync'
```

Or from the Ory Console:
1. Navigate to **Ory Console > Directory Sync**
2. Click **Add Provider > Microsoft Entra ID**
3. Copy the **SCIM Base URL** and **Bearer Token**

The SCIM base URL will look like:
```
https://<your-project>.projects.oryapis.com/polis/scim/v2
```

## Step 2: Configure Microsoft Entra ID

### 2a. Register Ory as an Enterprise Application

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com)
2. Navigate to **Identity > Applications > Enterprise applications**
3. Click **New application > Create your own application**
4. Name: `Ory Network`
5. Select **Integrate any other application you don't find in the gallery (Non-gallery)**
6. Click **Create**

### 2b. Configure Provisioning

1. In the Ory Network enterprise application, go to **Provisioning**
2. Click **Get started**
3. Set **Provisioning Mode** to **Automatic**
4. Under **Admin Credentials**:
   - **Tenant URL**: `https://<your-project>.projects.oryapis.com/polis/scim/v2`
   - **Secret Token**: The bearer token from Step 1
5. Click **Test Connection** to verify connectivity
6. Click **Save**

### 2c. Configure Attribute Mappings

Navigate to **Provisioning > Mappings > Provision Microsoft Entra ID Users**.

#### Required Attribute Mappings

| Entra ID Attribute | SCIM Attribute | Mapping Type |
|---|---|---|
| `userPrincipalName` | `userName` | Direct |
| `mail` | `emails[type eq "work"].value` | Direct |
| `givenName` | `name.givenName` | Direct |
| `surname` | `name.familyName` | Direct |
| `displayName` | `displayName` | Direct |
| `Switch([IsSoftDeleted], , "False", "True", "True", "False")` | `active` | Expression |
| `objectId` | `externalId` | Direct |

#### Optional Attribute Mappings

| Entra ID Attribute | SCIM Attribute | Notes |
|---|---|---|
| `jobTitle` | `title` | Job title |
| `department` | `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department` | Department |
| `companyName` | `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:organization` | Organization |
| `manager.objectId` | `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:manager.$ref` | Manager reference |
| `telephoneNumber` | `phoneNumbers[type eq "work"].value` | Phone number |

### 2d. Configure Scoping Filters (Optional)

To provision only specific users or groups:

1. Go to **Provisioning > Mappings > Provision Microsoft Entra ID Users**
2. Under **Source Object Scope**, click **Add scoping filter**
3. Example: Provision only users in the "Engineering" department:
   - **Attribute**: `department`
   - **Operator**: `EQUALS`
   - **Value**: `Engineering`

### 2e. Assign Users and Groups

1. Go to **Users and groups** in the enterprise application
2. Click **Add user/group**
3. Select users or groups to provision to Ory
4. Click **Assign**

### 2f. Start Provisioning

1. Go to **Provisioning > Overview**
2. Click **Start provisioning**
3. The initial cycle runs within ~40 minutes
4. Subsequent incremental cycles run every ~40 minutes

## SCIM API Payloads

### User Creation (Entra ID sends to Ory)

```json
{
  "schemas": [
    "urn:ietf:params:scim:schemas:core:2.0:User",
    "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"
  ],
  "userName": "jane.doe@contoso.com",
  "externalId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "active": true,
  "name": {
    "givenName": "Jane",
    "familyName": "Doe"
  },
  "displayName": "Jane Doe",
  "emails": [
    {
      "value": "jane.doe@contoso.com",
      "type": "work",
      "primary": true
    }
  ],
  "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": {
    "department": "Engineering",
    "organization": "Contoso"
  }
}
```

### User Update (PATCH)

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

### User Deactivation (Soft Delete)

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

## How Ory Maps SCIM Users to Identities

Ory Network maps SCIM attributes to identity traits and metadata:

```json
{
  "id": "ory-identity-uuid",
  "schema_id": "default",
  "traits": {
    "email": "jane.doe@contoso.com",
    "name": {
      "first": "Jane",
      "last": "Doe"
    }
  },
  "metadata_public": {
    "directory_sync": {
      "provider": "microsoft_entra_id",
      "external_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "department": "Engineering",
      "organization": "Contoso",
      "synced_at": "2024-12-15T10:30:00Z"
    }
  },
  "state": "active"
}
```

## Identity Schema for SCIM-Provisioned Users

Ensure your Ory identity schema supports the traits that SCIM provisions:

```json
{
  "$id": "https://schemas.ory.sh/presets/kratos/identity.scim.schema.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SCIM-Provisioned User",
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
            "first": { "type": "string", "title": "First Name" },
            "last": { "type": "string", "title": "Last Name" }
          }
        },
        "display_name": {
          "type": "string",
          "title": "Display Name"
        },
        "phone": {
          "type": "string",
          "title": "Phone Number"
        }
      },
      "required": ["email"],
      "additionalProperties": false
    }
  }
}
```

## Monitoring Provisioning

### In Entra ID

1. Go to **Provisioning > Provisioning logs** to see:
   - Successful provisioning events
   - Failed operations with error details
   - Skipped users (out of scope)

2. Go to **Provisioning > Overview** to see:
   - Current cycle status
   - Users provisioned / updated / disabled
   - Error counts

### In Ory

```bash
# List recently provisioned identities
ory list identities <project-id> --format json | \
  jq '.identities[] | select(.metadata_public.directory_sync.provider == "microsoft_entra_id")'

# Check a specific identity
ory get identity <identity-id> <project-id> --format json
```

## Provisioning Cycle Timing

| Phase | Timing |
|-------|--------|
| Initial cycle | Starts within 40 minutes of enabling, processes all assigned users |
| Incremental cycles | Every ~40 minutes after initial cycle completes |
| On-demand cycle | Triggered manually from **Provisioning > Overview > Restart provisioning** |
| Changes in Entra | Picked up in the next incremental cycle |

## Troubleshooting

| Issue | Solution |
|-------|---------|
| Test Connection fails | Verify SCIM URL and bearer token; check Ory project has directory sync enabled |
| Users not provisioning | Check scoping filters; verify users are assigned to the enterprise application |
| Attribute mapping errors | Review provisioning logs; ensure target attributes exist in Ory identity schema |
| Duplicate users | Set `externalId` mapping to `objectId` for reliable matching |
| Deprovisioned users can still log in | Verify `active` attribute mapping; check Ory identity state |
| Provisioning stuck | Restart provisioning from the Overview page; check for quarantine status |

## Security Considerations

- The SCIM bearer token should be rotated periodically
- Use Conditional Access policies in Entra ID to restrict where provisioning runs from
- Monitor provisioning logs for unexpected operations
- Consider scoping provisioning to specific groups rather than all users
- The Ory SCIM endpoint is protected by the bearer token and rate-limited

## References

- [Ory Directory Sync — Azure](https://www.ory.sh/docs/polis/directory-sync/providers/azure)
- [Ory Polis Documentation](https://www.ory.sh/docs/polis)
- [Microsoft Entra ID SCIM Provisioning](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/use-scim-to-provision-users-and-groups)
- [SCIM v2.0 Specification (RFC 7644)](https://datatracker.ietf.org/doc/html/rfc7644)
