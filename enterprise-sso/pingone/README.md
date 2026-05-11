# PingOne SSO Integration with Ory Network

## Overview

PingOne is Ping Identity's cloud-based identity platform designed for enterprise and regulated industries. PingOne provides identity verification, single sign-on, multi-factor authentication, and access management. It is particularly prevalent in financial services, healthcare, government, and other highly regulated sectors where strict identity governance and compliance are required.

This integration configures PingOne as a SAML 2.0 Identity Provider with Ory Polis acting as the SAML Service Provider. PingOne capabilities include:

- SAML 2.0 and OIDC federation
- PingOne MFA with FIDO2, push notifications, and SMS/email OTP
- Risk-based adaptive authentication
- PingOne Verify for identity proofing
- DaVinci orchestration for complex authentication flows
- Compliance with HIPAA, SOC 2, FedRAMP (PingOne for Government)

## Integration Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Application   │────1───▶│   Ory Polis     │────2───▶│   PingOne       │
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
2. Ory Polis generates SAML AuthnRequest, redirects to PingOne
3. User authenticates at PingOne (+ MFA/risk evaluation),
   PingOne returns SAML Response
4. Ory Polis validates assertion, creates/updates identity in Ory Kratos
5. User redirected back to application with active session
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Polis** | SAML Service Provider. Manages the SSO connection to PingOne. |
| **Ory Kratos** | Identity management. Stores identities from PingOne SAML assertions. |
| **Ory Hydra** | OAuth2/OIDC token issuance for downstream applications. |

## Prerequisites

- **PingOne Account**: Administrative access to PingOne Admin Console
- **PingOne Environment**: A configured environment (Sandbox or Production)
- **PingOne License**: License that includes SSO capabilities
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

### Step 2: Create a SAML Application in PingOne

1. Log in to [PingOne Admin Console](https://admin.pingone.com/)
2. Navigate to **Connections > Applications**
3. Click **+ Add Application**
4. Enter application name (e.g., "Ory Network SSO")
5. Select **SAML Application** as the application type
6. Click **Configure**

### Step 3: Configure SAML Settings

Select **Manually Enter** and configure:

| Field | Value |
|-------|-------|
| **ACS URLs** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs` |
| **Entity ID** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata` |
| **Assertion Validity Duration** | 60 (seconds) |
| **NameID Format** | `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` |
| **Signing Key** | Use environment default |
| **Signing Algorithm** | RSA_SHA256 |

Or upload Ory SP metadata XML for automatic configuration.

### Step 4: Configure Attribute Mapping

In the **Attribute Mappings** section:

| SAML Attribute | PingOne Attribute |
|---------------|------------------|
| `saml_subject` | `User ID` or `Email Address` |
| `email` | `Email Address` |
| `given_name` | `Given Name` |
| `family_name` | `Family Name` |
| `name` | `Formatted` (under Name) |

### Step 5: Download PingOne IdP Metadata

1. In the application configuration, go to the **Configuration** tab
2. Click **Download Metadata**
3. The PingOne metadata URL follows this pattern:
   ```
   https://auth.pingone.com/{environment-id}/saml20/metadata/{application-id}
   ```

PingOne SSO endpoint:
```
https://auth.pingone.com/{environment-id}/saml20/idp/sso
```

### Step 6: Enable the Application and Assign Users

1. Toggle the application to **Enabled**
2. Go to **Policies** tab to assign authentication policies
3. Go to **Access** tab (or use Groups) to assign users

### Step 7: Configure Ory Polis SSO Connection

```bash
ory create sso-connection \
  --project <project-id> \
  --provider saml \
  --label "PingOne SSO" \
  --idp-metadata-url "https://auth.pingone.com/{environment-id}/saml20/metadata/{application-id}" \
  --organization-id <org-id>

ory update organization \
  --project <project-id> \
  --id <org-id> \
  --domains "yourdomain.com"
```

## Technical Details

### SAML Attribute Mapping

| PingOne Attribute | SAML Attribute Name | Ory Identity Trait |
|------------------|--------------------|--------------------|
| Email Address | `email` | `traits.email` |
| Given Name | `given_name` | `traits.name.first` |
| Family Name | `family_name` | `traits.name.last` |
| Formatted Name | `name` | `traits.name.full` |
| Account ID | `accountId` | `metadata_public.pingone_account_id` |
| Population | `population` | `metadata_public.population` |

### SAML Assertion Details

- **NameID Format**: `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`
- **Binding**: HTTP-POST for ACS, HTTP-Redirect for AuthnRequest
- **Signature Algorithm**: RSA-SHA256
- **Assertion Signed**: Yes
- **Response Signed**: Yes
- **Issuer**: `https://auth.pingone.com/{environment-id}/saml20`

### PingOne Region-Specific Endpoints

| Region | Auth Base URL |
|--------|--------------|
| North America | `https://auth.pingone.com` |
| Europe | `https://auth.pingone.eu` |
| Asia Pacific | `https://auth.pingone.asia` |
| Canada | `https://auth.pingone.ca` |

### Sample PingOne SAML Metadata Snippet

```xml
<EntityDescriptor entityID="https://auth.pingone.com/{environment-id}/saml20"
  xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>
            <!-- PingOne signing certificate (Base64 encoded) -->
          </X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://auth.pingone.com/{environment-id}/saml20/idp/sso"/>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="https://auth.pingone.com/{environment-id}/saml20/idp/sso"/>
  </IDPSSODescriptor>
</EntityDescriptor>
```

## Testing

### 1. Verify Metadata

```bash
curl -s "https://auth.pingone.com/{environment-id}/saml20/metadata/{application-id}" | xmllint --format -
```

### 2. Test SP-Initiated SSO

1. Navigate to your application login page
2. Enter an email from your PingOne-managed domain
3. Authenticate at PingOne
4. Verify redirect with active session

### 3. Test from PingOne

1. Log in to PingOne's My Apps portal
2. Click the Ory Network application
3. Verify SSO completes

### 4. Verify Identity

```bash
ory list identities --project <project-id> --format json | \
  jq '.[] | select(.traits.email == "user@yourdomain.com")'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **ACS URL mismatch** | URL not matching | Verify ACS URL in PingOne matches Ory exactly |
| **Entity ID mismatch** | Audience mismatch | Ensure Entity ID matches Ory's SP Entity ID |
| **Certificate error** | Certificate expired | Download new metadata from PingOne and update Ory connection |
| **User cannot authenticate** | User not assigned to application | Assign the user via Groups or access policies in PingOne |
| **Region mismatch** | Wrong PingOne endpoint region | Use the correct regional base URL for your PingOne environment |
| **Application disabled** | Application toggled off | Enable the application in PingOne Admin Console |
| **MFA enforcement failure** | PingOne MFA policy issues | Review MFA policies in PingOne > Experiences > Authentication |
| **Clock skew** | Assertion validity too short | Increase assertion validity duration or check server time sync |

## Resources

- [Ory Polis PingOne SSO Documentation](https://www.ory.sh/docs/polis/sso-providers/pingone)
- [Ory Polis SSO Overview](https://www.ory.sh/docs/polis/sso)
- [PingOne SAML Application Configuration](https://docs.pingidentity.com/r/en-us/pingone/p1_add_app_worker_saml)
- [PingOne Admin Console](https://admin.pingone.com/)
- [PingOne Documentation](https://docs.pingidentity.com/r/en-us/pingone/pingone_landing_page)
- [Ory CLI Reference](https://www.ory.sh/docs/cli)
