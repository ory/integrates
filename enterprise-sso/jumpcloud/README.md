# JumpCloud SSO Integration with Ory Network

## Overview

JumpCloud is a cloud-based directory platform that provides unified identity, access, and device management. As an alternative to traditional Active Directory, JumpCloud serves as a modern cloud directory for organizations looking to manage identities across platforms (Windows, macOS, Linux) without on-premises infrastructure.

This integration configures JumpCloud as a SAML 2.0 Identity Provider with Ory Polis acting as the Service Provider. JumpCloud capabilities include:

- SAML 2.0 SSO for web applications
- Cloud LDAP and RADIUS
- Cross-platform device management
- Conditional Access policies
- Multi-factor authentication
- User group-based application access
- Directory-as-a-Service for SMB and mid-market

## Integration Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Application   │────1───▶│   Ory Polis     │────2───▶│   JumpCloud     │
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
2. Ory Polis generates SAML AuthnRequest, redirects to JumpCloud
3. User authenticates at JumpCloud (+ MFA), returns SAML Response
4. Ory Polis validates assertion, creates/updates identity in Ory Kratos
5. User redirected back to application with active session
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Polis** | SAML Service Provider. Manages the SSO connection to JumpCloud. |
| **Ory Kratos** | Identity management. Stores identities from JumpCloud SAML assertions. |
| **Ory Hydra** | OAuth2/OIDC token issuance for downstream applications. |

## Prerequisites

- **JumpCloud Account**: Admin access to JumpCloud Admin Console
- **JumpCloud Plan**: JumpCloud SSO is available on the SSO Package or Platform plans
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

### Step 2: Create a Custom SAML Application in JumpCloud

1. Log in to [JumpCloud Admin Console](https://console.jumpcloud.com/)
2. Navigate to **SSO Applications**
3. Click **+ Add New Application**
4. Click **Custom SAML App**
5. Enter a display label (e.g., "Ory Network SSO")

### Step 3: Configure SSO Settings

In the **SSO** tab:

| Field | Value |
|-------|-------|
| **IdP Entity ID** | `https://sso.jumpcloud.com/saml2/{app-name}` (auto-generated) |
| **SP Entity ID** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata` |
| **ACS URL** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs` |
| **SAMLSubject NameID** | email |
| **SAMLSubject NameID Format** | `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` |
| **Signature Algorithm** | RSA-SHA256 |
| **Sign Assertion** | Checked |
| **Sign Response** | Checked |
| **Default RelayState** | (leave blank) |

### Step 4: Configure Attribute Mapping

In the **SSO** tab under **Attributes**:

| Service Provider Attribute Name | JumpCloud Attribute Name |
|-------------------------------|------------------------|
| `email` | `email` |
| `firstName` | `firstname` |
| `lastName` | `lastname` |
| `displayName` | `displayname` |
| `department` | `department` |

### Step 5: Download JumpCloud Metadata

1. In the SSO application settings, click **Export Metadata**
2. Download the XML file
3. The JumpCloud metadata URL follows this pattern:
   ```
   https://sso.jumpcloud.com/saml2/{app-name}
   ```

### Step 6: Assign User Groups

1. Go to the **User Groups** tab
2. Select the groups that should have access
3. Click **Save**

### Step 7: Activate the Application

Click **Activate** to enable the application.

### Step 8: Configure Ory Polis SSO Connection

```bash
ory create sso-connection \
  --project <project-id> \
  --provider saml \
  --label "JumpCloud SSO" \
  --idp-metadata-file ./jumpcloud-metadata.xml \
  --organization-id <org-id>

ory update organization \
  --project <project-id> \
  --id <org-id> \
  --domains "yourdomain.com"
```

## Technical Details

### SAML Attribute Mapping

| JumpCloud Attribute | SAML Attribute Name | Ory Identity Trait |
|--------------------|--------------------|--------------------|
| `email` | `email` | `traits.email` |
| `firstname` | `firstName` | `traits.name.first` |
| `lastname` | `lastName` | `traits.name.last` |
| `displayname` | `displayName` | `traits.name.full` |
| `department` | `department` | `metadata_public.department` |
| `jobTitle` | `jobTitle` | `metadata_public.title` |

### SAML Assertion Details

- **NameID Format**: `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`
- **Binding**: HTTP-POST for ACS, HTTP-Redirect for AuthnRequest
- **Signature Algorithm**: RSA-SHA256
- **Assertion Signed**: Yes
- **Response Signed**: Yes
- **IdP Entity ID**: `https://sso.jumpcloud.com/saml2/{app-name}`
- **SSO URL**: `https://sso.jumpcloud.com/saml2/{app-name}`

### Sample JumpCloud SAML Metadata Snippet

```xml
<EntityDescriptor entityID="https://sso.jumpcloud.com/saml2/{app-name}"
  xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>
            <!-- JumpCloud signing certificate (Base64 encoded) -->
          </X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://sso.jumpcloud.com/saml2/{app-name}"/>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="https://sso.jumpcloud.com/saml2/{app-name}"/>
  </IDPSSODescriptor>
</EntityDescriptor>
```

## Testing

### 1. Test SP-Initiated SSO

1. Navigate to your application login page
2. Enter an email from your JumpCloud-managed domain
3. Authenticate at JumpCloud
4. Verify redirect with active session

### 2. Test from JumpCloud User Portal

1. Log in to JumpCloud User Portal (`https://console.jumpcloud.com/userconsole`)
2. Click the Ory Network application tile
3. Verify SSO completes

### 3. Verify Identity

```bash
ory list identities --project <project-id> --format json | \
  jq '.[] | select(.traits.email == "user@yourdomain.com")'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **ACS URL error** | URL mismatch | Verify ACS URL in JumpCloud matches Ory's ACS endpoint |
| **Entity ID mismatch** | SP Entity ID wrong | Ensure SP Entity ID matches Ory's metadata Entity ID |
| **Certificate error** | Expired JumpCloud cert | Export new metadata from JumpCloud and update Ory connection |
| **User cannot access** | User not in assigned group | Add user to a group assigned to the SAML application |
| **Attributes missing** | Attribute mapping incomplete | Add required attributes in JumpCloud SSO configuration |
| **Application inactive** | App not activated | Activate the application in JumpCloud Admin Console |
| **MFA prompt loop** | MFA misconfigured | Verify MFA policies in JumpCloud for the user/group |

## Resources

- [Ory Polis JumpCloud SSO Documentation](https://www.ory.sh/docs/polis/sso-providers/jumpcloud)
- [Ory Polis SSO Overview](https://www.ory.sh/docs/polis/sso)
- [JumpCloud SAML SSO Guide](https://support.jumpcloud.com/s/article/single-sign-on-sso-with-saml-20)
- [JumpCloud Custom SAML Application](https://support.jumpcloud.com/s/article/custom-saml-sso-connector)
- [JumpCloud Admin Console](https://console.jumpcloud.com/)
- [Ory CLI Reference](https://www.ory.sh/docs/cli)
