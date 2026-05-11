# OneLogin SAML SSO Integration with Ory Network

## Overview

OneLogin is a cloud-based identity and access management platform that provides unified access management, including single sign-on, multi-factor authentication, and user provisioning. OneLogin supports SAML 2.0 federation and is used by enterprises across various industries for workforce identity management.

This integration configures OneLogin as a SAML 2.0 Identity Provider with Ory Polis as the SAML Service Provider. OneLogin capabilities include:

- SAML 2.0 SP-initiated and IdP-initiated SSO
- SmartFactor Authentication (risk-based MFA)
- SCIM user provisioning
- Custom connector creation for any SAML application
- Directory integration (AD, LDAP, G Suite, Workday)

## Integration Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Application   │────1───▶│   Ory Polis     │────2───▶│   OneLogin      │
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
2. Ory Polis generates SAML AuthnRequest, redirects to OneLogin
3. User authenticates at OneLogin (+ MFA), OneLogin returns SAML Response
4. Ory Polis validates assertion, creates/updates identity in Ory Kratos
5. User redirected back to application with active session
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Polis** | SAML Service Provider. Manages the SSO connection to OneLogin. |
| **Ory Kratos** | Identity management. Stores user identities from OneLogin SAML assertions. |
| **Ory Hydra** | OAuth2/OIDC token issuance for downstream applications. |

## Prerequisites

- **OneLogin Account**: Admin access to OneLogin with permissions to create applications
- **OneLogin Plan**: Any plan that includes SAML SSO (Professional, Enterprise)
- **Ory Network Account**: Active project with Polis enabled
- **Verified Domain**: Organization email domain verified in Ory Network
- **OneLogin Subdomain**: Your OneLogin subdomain (e.g., `yourcompany.onelogin.com`)

## Configuration

### Step 1: Obtain Ory SP Metadata

```
https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata
```

Key values:
- **ACS URL**: `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs`
- **Entity ID**: `https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata`

### Step 2: Create a SAML Application in OneLogin

1. Log in to [OneLogin Admin Console](https://yourcompany.onelogin.com/admin2)
2. Navigate to **Applications > Applications**
3. Click **Add App**
4. Search for **SAML Custom Connector (Advanced)** and select it
5. Enter a display name (e.g., "Ory Network SSO")
6. Click **Save**

### Step 3: Configure Application Settings

Go to the **Configuration** tab:

| Field | Value |
|-------|-------|
| **Audience (EntityID)** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata` |
| **Recipient** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs` |
| **ACS (Consumer) URL Validator** | `^https:\/\/{your-ory-project-slug}\.projects\.oryapis\.com\/saml\/acs$` |
| **ACS (Consumer) URL** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs` |
| **SAML nameID format** | Email |
| **SAML signature element** | Both (Response and Assertion) |

### Step 4: Configure Parameters (Attribute Mapping)

Go to the **Parameters** tab. Add the following custom parameters:

| Field Name | Value | Include in SAML assertion |
|-----------|-------|--------------------------|
| `email` | Email | Yes |
| `firstName` | First Name | Yes |
| `lastName` | Last Name | Yes |
| `displayName` | Display Name | Yes |
| `department` | Department | Yes |

### Step 5: Configure SSO Settings

Go to the **SSO** tab:
1. Note the **Issuer URL**: `https://app.onelogin.com/saml/metadata/{app-id}`
2. Note the **SAML 2.0 Endpoint (HTTP)**: `https://yourcompany.onelogin.com/trust/saml2/http-post/sso/{app-id}`
3. Note the **SLO Endpoint (HTTP)**: `https://yourcompany.onelogin.com/trust/saml2/http-redirect/slo/{app-id}`
4. Set **SAML Signature Algorithm** to **SHA-256**
5. Download the **X.509 Certificate**

### Step 6: Assign Users

Go to the **Users** tab or use **Rules**:
1. Click **Assign users** or configure assignment rules
2. Select users or groups for access

### Step 7: Download OneLogin Metadata

The OneLogin SAML metadata URL:
```
https://app.onelogin.com/saml/metadata/{app-id}
```

### Step 8: Configure Ory Polis SSO Connection

```bash
ory create sso-connection \
  --project <project-id> \
  --provider saml \
  --label "OneLogin SSO" \
  --idp-metadata-url "https://app.onelogin.com/saml/metadata/{app-id}" \
  --organization-id <org-id>

ory update organization \
  --project <project-id> \
  --id <org-id> \
  --domains "yourdomain.com"
```

## Technical Details

### SAML Attribute Mapping

| OneLogin Attribute | SAML Attribute Name | Ory Identity Trait |
|-------------------|--------------------|--------------------|
| Email | `email` | `traits.email` |
| First Name | `firstName` | `traits.name.first` |
| Last Name | `lastName` | `traits.name.last` |
| Display Name | `displayName` | `traits.name.full` |
| Department | `department` | `metadata_public.department` |
| Title | `title` | `metadata_public.title` |
| Groups/Roles | `memberOf` | `metadata_public.groups` |

### SAML Assertion Details

- **NameID Format**: `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`
- **Binding**: HTTP-POST for ACS, HTTP-Redirect for AuthnRequest
- **Signature Algorithm**: RSA-SHA256
- **Digest Algorithm**: SHA256
- **Assertion Signed**: Yes
- **Response Signed**: Yes
- **Certificate**: OneLogin-managed

### Sample OneLogin SAML Metadata Snippet

```xml
<EntityDescriptor entityID="https://app.onelogin.com/saml/metadata/{app-id}"
  xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>
            <!-- OneLogin signing certificate (Base64 encoded) -->
          </X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <SingleLogoutService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://yourcompany.onelogin.com/trust/saml2/http-redirect/slo/{app-id}"/>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://yourcompany.onelogin.com/trust/saml2/http-redirect/sso/{app-id}"/>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="https://yourcompany.onelogin.com/trust/saml2/http-post/sso/{app-id}"/>
  </IDPSSODescriptor>
</EntityDescriptor>
```

## Testing

### 1. Verify Metadata

```bash
curl -s "https://app.onelogin.com/saml/metadata/{app-id}" | xmllint --format -
```

### 2. Test SP-Initiated SSO

1. Navigate to your application login page
2. Enter an email from your OneLogin-managed domain
3. Authenticate at OneLogin
4. Verify redirect with active session

### 3. Test IdP-Initiated SSO

1. Log in to OneLogin portal
2. Click the Ory Network app icon
3. Verify SSO completes

### 4. Verify Identity

```bash
ory list identities --project <project-id> --format json | \
  jq '.[] | select(.traits.email == "user@yourdomain.com")'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **"The response was received at an invalid URL"** | ACS URL mismatch | Verify ACS URL in OneLogin matches Ory's ACS URL exactly |
| **"Audience validation failed"** | Entity ID mismatch | Ensure Audience (EntityID) matches Ory's SP Entity ID |
| **Certificate error** | Certificate expired or rotated | Download new certificate from OneLogin and update Ory SSO connection |
| **User not provisioned** | User not assigned to app | Assign the user in OneLogin > Applications > Users |
| **Attributes missing** | Parameters not configured | Add required parameters in OneLogin app configuration |
| **Clock skew** | Time synchronization | OneLogin uses NTP; check assertion timestamps |
| **Signature validation failed** | Signature algorithm mismatch | Set OneLogin to use SHA-256 in SSO settings |

## Resources

- [Ory Polis OneLogin SSO Documentation](https://www.ory.sh/docs/polis/sso-providers/onelogin)
- [Ory Polis SSO Overview](https://www.ory.sh/docs/polis/sso)
- [OneLogin SAML Custom Connector](https://onelogin.service-now.com/kb_view_customer.do?sysparm_article=KB0010419)
- [OneLogin Developer Documentation](https://developers.onelogin.com/)
- [OneLogin SAML Toolkit](https://developers.onelogin.com/saml)
- [Ory CLI Reference](https://www.ory.sh/docs/cli)
