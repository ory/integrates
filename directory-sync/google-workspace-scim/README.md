# Google Workspace Directory Sync for Ory Network

Automatic user provisioning and deprovisioning from Google Workspace to Ory Network.

## Overview

This integration synchronizes users from your Google Workspace directory to Ory Network. Google Workspace supports automatic provisioning to third-party SCIM applications, enabling user lifecycle management — when users are created, updated, suspended, or deleted in Google Admin, those changes are reflected in Ory.

| Feature | Details |
|---------|---------|
| Platform | Google Workspace |
| Protocol | SCIM v2.0 (via Google's auto-provisioning) |
| Direction | Google Workspace -> Ory Network |
| Operations | Create, Update, Suspend, Delete users |
| Ory Platform | Ory Network (managed cloud) |

## Architecture

```
┌──────────────────┐    SCIM v2.0    ┌──────────────┐
│                  │  provisioning   │              │
│  Google          ├────────────────►│  Ory Network │
│  Workspace       │                 │  (SCIM API)  │
│                  │  POST /Users    │              │
│  (Cloud          │  PUT /Users/:id │              │
│   Identity)      │  PATCH /Users   │              │
│                  │  DELETE /Users  │              │
└──────────────────┘                 └──────────────┘
```

## Prerequisites

- Ory Network project with directory sync (Ory Polis) enabled
- Google Workspace account (Business Standard or higher for auto-provisioning)
- Google Workspace super administrator role

## Step 1: Get Ory SCIM Configuration

1. Navigate to **Ory Console > Directory Sync**
2. Click **Add Provider > Google Workspace**
3. Copy the **SCIM Base URL** and **Bearer Token**

```
SCIM Base URL: https://<your-project>.projects.oryapis.com/polis/scim/v2
Bearer Token:  ory_ds_...
```

## Step 2: Configure Google Workspace Auto-Provisioning

### 2a. Add Ory as a SAML/SCIM Application

1. Sign in to the [Google Admin Console](https://admin.google.com)
2. Navigate to **Apps > Web and mobile apps**
3. Click **Add App > Add custom SAML app** (or search the catalog)
4. Name: `Ory Network`
5. Complete the SAML setup (if also configuring SSO) or skip to provisioning

### 2b. Configure Auto-Provisioning

1. In the Ory Network app, click **Auto-provisioning**
2. Click **Set up auto-provisioning**
3. Enter the SCIM configuration:

| Field | Value |
|-------|-------|
| SCIM Endpoint URL | `https://<your-project>.projects.oryapis.com/polis/scim/v2` |
| Access Token | `ory_ds_...` |

4. Click **Test Connection**
5. Click **Continue** once the test passes

### 2c. Configure Attribute Mappings

Google provides a default set of SCIM attribute mappings. Verify and customize:

| Google Workspace Attribute | SCIM Attribute | Notes |
|---|---|---|
| Primary email | `userName` | Required identifier |
| Primary email | `emails[type eq "work"].value` | Email trait |
| First name | `name.givenName` | Given name |
| Last name | `name.familyName` | Family name |
| Full name | `displayName` | Display name |
| Google ID | `externalId` | Unique identifier |
| Phone number | `phoneNumbers[type eq "work"].value` | Optional |
| Department | `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department` | Optional |
| Title | `title` | Optional |
| Organization | `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:organization` | Optional |
| Manager email | `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:manager.value` | Optional |

Click **Finish** to save the attribute mappings.

### 2d. Enable Auto-Provisioning

1. Toggle **Auto-provisioning** to **Active**
2. Configure provisioning scope:
   - **Everyone in the organization** — provisions all users
   - **Selected organizational units** — provisions users in specific OUs
   - **Groups** — provisions users in specific Google Groups

### 2e. Configure Deprovisioning Behavior

Under **Auto-provisioning** settings:

| Scenario | Action |
|----------|--------|
| User suspended in Google | SCIM `PATCH` sets `active: false` |
| User deleted in Google | SCIM `DELETE` request |
| User moved out of scope | Deprovision (configurable: suspend or delete) |

## SCIM API Payloads

### User Creation (Google sends to Ory)

```json
{
  "schemas": [
    "urn:ietf:params:scim:schemas:core:2.0:User",
    "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"
  ],
  "userName": "jane.doe@company.com",
  "externalId": "Google-unique-user-id",
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
  "phoneNumbers": [
    {
      "value": "+1-555-0100",
      "type": "work"
    }
  ],
  "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": {
    "department": "Engineering",
    "organization": "Acme Corp",
    "manager": {
      "value": "manager@company.com"
    }
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
      "provider": "google_workspace",
      "external_id": "Google-unique-user-id",
      "department": "Engineering",
      "organization": "Acme Corp",
      "synced_at": "2024-12-15T10:30:00Z"
    }
  },
  "state": "active"
}
```

## Alternative: Google Directory API Integration

For more control over synchronization, you can build a custom sync service using the Google Directory API instead of relying on Google's built-in SCIM auto-provisioning.

### Architecture (Custom Sync)

```
┌────────────────┐                    ┌──────────────┐
│                │  Directory API     │              │
│  Google        ├───────────────────►│  Sync        │
│  Workspace     │  (poll or push)    │  Service     │
│                │                    │              │
└────────────────┘                    └──────┬───────┘
                                             │
                                             │ Ory Admin API
                                             │
                                             ▼
                                      ┌──────────────┐
                                      │              │
                                      │  Ory Network │
                                      │              │
                                      └──────────────┘
```

### Custom Sync Service Example

```javascript
// sync-service.js
const { google } = require("googleapis");
const { OryClient } = require("@ory/client");

const ory = new OryClient({
  basePath: process.env.ORY_SDK_URL,
  accessToken: process.env.ORY_API_KEY,
});

// Service account authentication
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
  scopes: [
    "https://www.googleapis.com/auth/admin.directory.user.readonly",
    "https://www.googleapis.com/auth/admin.directory.group.readonly",
  ],
  subject: process.env.GOOGLE_ADMIN_EMAIL, // Impersonate admin
});

const directory = google.admin({ version: "directory_v1", auth });

async function syncUsers() {
  let pageToken = null;

  do {
    const { data } = await directory.users.list({
      domain: process.env.GOOGLE_DOMAIN,
      maxResults: 100,
      pageToken,
      projection: "full",
    });

    for (const gUser of data.users || []) {
      await syncUser(gUser);
    }

    pageToken = data.nextPageToken;
  } while (pageToken);
}

async function syncUser(gUser) {
  const email = gUser.primaryEmail;
  const externalId = gUser.id;

  // Check if identity already exists
  const { data: identities } = await ory.identity.listIdentities({
    credentialsIdentifier: email,
  });

  const traits = {
    email,
    name: {
      first: gUser.name?.givenName || "",
      last: gUser.name?.familyName || "",
    },
  };

  const metadataPublic = {
    directory_sync: {
      provider: "google_workspace",
      external_id: externalId,
      department: gUser.organizations?.[0]?.department || null,
      organization: gUser.organizations?.[0]?.name || null,
      synced_at: new Date().toISOString(),
    },
  };

  if (identities.length > 0) {
    // Update existing identity
    const identity = identities[0];
    await ory.identity.updateIdentity({
      id: identity.id,
      updateIdentityBody: {
        schema_id: identity.schema_id,
        traits,
        metadata_public: { ...identity.metadata_public, ...metadataPublic },
        state: gUser.suspended ? "inactive" : "active",
      },
    });
    console.log(`Updated identity for ${email}`);
  } else if (!gUser.suspended) {
    // Create new identity
    await ory.identity.createIdentity({
      createIdentityBody: {
        schema_id: "default",
        traits,
        metadata_public: metadataPublic,
        state: "active",
      },
    });
    console.log(`Created identity for ${email}`);
  }
}

// Run sync on a schedule (e.g., every 15 minutes via cron)
syncUsers()
  .then(() => console.log("Sync complete"))
  .catch((err) => console.error("Sync failed:", err));
```

### Environment Variables (Custom Sync)

```bash
ORY_SDK_URL=https://your-project.projects.oryapis.com
ORY_API_KEY=ory_pat_...
GOOGLE_SERVICE_ACCOUNT_KEY=./service-account.json
GOOGLE_ADMIN_EMAIL=admin@company.com
GOOGLE_DOMAIN=company.com
```

### package.json (Custom Sync)

```json
{
  "name": "google-workspace-ory-sync",
  "version": "1.0.0",
  "dependencies": {
    "@ory/client": "^1.0.0",
    "googleapis": "^130.0.0"
  }
}
```

## Provisioning Cycle Timing

| Method | Timing |
|--------|--------|
| Google Auto-Provisioning | Initial sync within 24 hours; incremental changes within ~1 hour |
| Custom Sync Service | Configurable (e.g., every 15 minutes via cron/scheduler) |
| Manual trigger | Available in Google Admin Console under auto-provisioning settings |

## Monitoring

### In Google Admin Console

- Navigate to **Reports > Audit > SAML** for provisioning audit logs
- Check **Apps > Web and mobile apps > Ory Network > Auto-provisioning** for status

### In Ory

```bash
ory list identities <project-id> --format json | \
  jq '.identities[] | select(.metadata_public.directory_sync.provider == "google_workspace")'
```

## Troubleshooting

| Issue | Solution |
|-------|---------|
| Test Connection fails | Verify SCIM URL and bearer token; check Ory directory sync is enabled |
| Users not provisioning | Check auto-provisioning scope (OUs/Groups); allow up to 24h for initial sync |
| Attributes missing | Verify attribute mappings in Google Admin |
| Suspended users can log in | Confirm that `active: false` maps to Ory identity state `inactive` |
| Google auto-provisioning slow | Initial sync can take up to 24 hours; consider the custom sync approach for faster turnaround |
| Custom sync: 403 Forbidden | Ensure service account has domain-wide delegation and correct scopes |

## References

- [Ory Directory Sync Documentation](https://www.ory.sh/docs/polis/directory-sync)
- [Google Workspace Auto-Provisioning (SCIM)](https://support.google.com/a/answer/7681288)
- [Google Workspace Admin SDK Directory API](https://developers.google.com/admin-sdk/directory/reference/rest)
- [SCIM v2.0 Specification (RFC 7644)](https://datatracker.ietf.org/doc/html/rfc7644)
