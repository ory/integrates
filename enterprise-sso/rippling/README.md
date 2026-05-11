# Rippling SSO Integration with Ory Network

## Overview

Rippling is a unified workforce management platform that combines HR, IT, and Finance. Rippling's identity management capabilities allow organizations to manage employee lifecycle, device management, and application access from a single platform. As a SAML Identity Provider, Rippling enables SSO for employees into applications protected by Ory Network, with the added benefit of automatic provisioning and deprovisioning tied to HR events (onboarding, offboarding, role changes).

Key Rippling capabilities:
- SAML 2.0 SSO for third-party applications
- Automatic user provisioning/deprovisioning via SCIM
- HR-driven identity lifecycle (hire, terminate, transfer triggers SSO access)
- Device trust and endpoint management
- App access tied to department, role, location, and employment status
- Custom SAML application configuration

## Integration Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Application   │────1───▶│   Ory Polis     │────2───▶│   Rippling      │
│   (Your App)    │         │   (SAML SP)     │         │   (SAML IdP)    │
│                 │◀───5────│                 │◀───3────│                 │
│                 │         │                 │         │                 │
└─────────────────┘         └────────┬────────┘         └─────────────────┘
                                     │
                                     4
                                     │
                            ┌────────▼────────┐
                            │  Ory Identity   │
                            │  (Kratos)       │
                            │  User Created/  │
                            │  Updated        │
                            └─────────────────┘

Flow:
1. User accesses application, redirected to Ory Polis login
2. Ory Polis generates SAML AuthnRequest, redirects to Rippling
3. User authenticates at Rippling, Rippling returns SAML Response
4. Ory Polis validates assertion, creates/updates identity in Ory Kratos
5. User redirected back to application with active session
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Polis** | SAML Service Provider. Manages the SSO connection to Rippling. |
| **Ory Kratos** | Identity management. Stores identities from Rippling SAML assertions. |
| **Ory Hydra** | OAuth2/OIDC token issuance for downstream applications. |

## Prerequisites

- **Rippling Account**: Admin access to Rippling with IT permissions
- **Rippling Plan**: Plan that includes SSO capabilities (Rippling Unity or Rippling Platform)
- **Ory Network Account**: Active project with Polis enabled
- **Verified Domain**: Organization email domain verified in Ory Network

## Configuration

### Step 1: Obtain Ory SP Metadata

```
https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata
```

Key values:
- **ACS URL**: `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs`
- **Entity ID**: `https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata`

### Step 2: Create a Custom SAML Application in Rippling

1. Log in to [Rippling Admin](https://app.rippling.com/)
2. Navigate to **IT Management > Custom Apps** (or **App Shop**)
3. Click **Add Custom App**
4. Select **SAML SSO** as the sign-on method
5. Enter application name (e.g., "Ory Network SSO")

### Step 3: Configure SAML Settings

| Field | Value |
|-------|-------|
| **ACS URL** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs` |
| **Entity ID / Audience** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata` |
| **NameID Format** | Email Address |
| **NameID Value** | User's work email |
| **Signature Algorithm** | SHA-256 |

### Step 4: Configure Attribute Mapping

| Rippling User Field | SAML Attribute Name |
|--------------------|-------------------|
| Work Email | `email` |
| First Name | `firstName` |
| Last Name | `lastName` |
| Display Name | `displayName` |
| Department | `department` |
| Job Title | `title` |
| Employee ID | `employeeId` |

### Step 5: Download Rippling IdP Metadata

1. From the Custom App configuration, download the **IdP Metadata XML**
2. Note the **SSO URL** and **IdP Certificate**

### Step 6: Assign Employees

1. Go to the **Access** or **Provisioning** settings
2. Assign by department, team, role, or individual employees
3. Rippling will automatically manage access based on HR events

### Step 7: Configure Ory Polis SSO Connection

```bash
ory create sso-connection \
  --project <project-id> \
  --provider saml \
  --label "Rippling SSO" \
  --idp-metadata-file ./rippling-metadata.xml \
  --organization-id <org-id>

ory update organization \
  --project <project-id> \
  --id <org-id> \
  --domains "yourdomain.com"
```

## Technical Details

### SAML Attribute Mapping

| Rippling Attribute | SAML Attribute Name | Ory Identity Trait |
|-------------------|--------------------|--------------------|
| Work Email | `email` | `traits.email` |
| First Name | `firstName` | `traits.name.first` |
| Last Name | `lastName` | `traits.name.last` |
| Display Name | `displayName` | `traits.name.full` |
| Department | `department` | `metadata_public.department` |
| Job Title | `title` | `metadata_public.title` |
| Employee ID | `employeeId` | `metadata_public.employee_id` |
| Manager Email | `managerEmail` | `metadata_public.manager_email` |

### SAML Assertion Details

- **NameID Format**: `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`
- **Binding**: HTTP-POST for ACS, HTTP-Redirect for AuthnRequest
- **Signature Algorithm**: RSA-SHA256
- **Assertion Signed**: Yes
- **Response Signed**: Yes

### Sample Rippling SAML Metadata Snippet

```xml
<EntityDescriptor entityID="https://app.rippling.com/saml/metadata/{app-id}"
  xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>
            <!-- Rippling signing certificate (Base64 encoded) -->
          </X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="https://app.rippling.com/saml/sso/{app-id}"/>
  </IDPSSODescriptor>
</EntityDescriptor>
```

### HR-Driven Lifecycle Integration

Rippling's key differentiator is that SSO access is tied to HR events:

| HR Event | Rippling Action | Effect on Ory |
|----------|----------------|---------------|
| Employee hired | App auto-assigned | User can SSO into Ory-protected apps |
| Employee terminated | App auto-revoked | SSO access immediately removed |
| Role/department change | Access policies re-evaluated | Access may be granted or revoked |
| Leave of absence | Access optionally suspended | SSO blocked during leave |

## Testing

### 1. Test SP-Initiated SSO

1. Navigate to your application login page
2. Enter an email from your Rippling-managed domain
3. Authenticate at Rippling
4. Verify redirect with active session

### 2. Test from Rippling Dashboard

1. Log in to Rippling as an employee
2. Click the Ory Network application in the app launcher
3. Verify SSO completes

### 3. Verify Identity

```bash
ory list identities --project <project-id> --format json | \
  jq '.[] | select(.traits.email == "user@yourdomain.com")'
```

### 4. Test Deprovisioning

1. Remove app assignment from a test user in Rippling
2. Attempt SSO with that user
3. Verify the user is denied access

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **ACS URL error** | URL mismatch | Verify ACS URL in Rippling matches Ory exactly |
| **Entity ID mismatch** | Audience mismatch | Ensure Entity ID matches Ory's SP Entity ID |
| **Certificate error** | Expired certificate | Download new metadata from Rippling and update Ory |
| **User cannot access** | Employee not assigned to app | Assign the employee or their department in Rippling |
| **Access revoked unexpectedly** | HR event triggered deprovisioning | Check Rippling audit log for employment status changes |
| **Attributes missing** | Mapping incomplete | Add required attribute mappings in Rippling SAML config |
| **App not visible** | App not deployed to employee | Check provisioning rules in Rippling |

## Resources

- [Ory Polis Rippling SSO Documentation](https://www.ory.sh/docs/polis/sso-providers/rippling)
- [Ory Polis SSO Overview](https://www.ory.sh/docs/polis/sso)
- [Rippling SSO Documentation](https://www.rippling.com/solutions/single-sign-on)
- [Rippling Custom App Configuration](https://help.rippling.com/s/)
- [Rippling Admin Portal](https://app.rippling.com/)
- [Ory CLI Reference](https://www.ory.sh/docs/cli)
