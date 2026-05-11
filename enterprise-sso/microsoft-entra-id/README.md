# Microsoft Entra ID (Azure AD) SAML SSO Integration with Ory Network

## Overview

Microsoft Entra ID (formerly Azure Active Directory) is the world's most widely adopted cloud-based identity and access management service. It is the default IdP for organizations using Microsoft 365, Azure, and the broader Microsoft ecosystem. As a SAML Identity Provider, Entra ID enables enterprises to extend their existing directory to applications protected by Ory Network, providing seamless single sign-on for employees.

This is typically the most common enterprise SSO integration, as the majority of enterprise organizations manage identities through Entra ID. Key capabilities include:

- SAML 2.0 and OIDC federation
- Conditional Access policies (location, device, risk-based)
- Enterprise Application gallery with pre-configured templates
- Automatic certificate management and rotation
- User and group assignment for app access
- SCIM provisioning support

## Integration Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Application   │────1───▶│   Ory Polis     │────2───▶│ Microsoft Entra │
│   (Your App)    │         │   (SAML SP)     │         │   ID (SAML IdP) │
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
2. Ory Polis generates SAML AuthnRequest, redirects to Entra ID
3. User authenticates with Entra ID (+ Conditional Access / MFA),
   Entra ID returns SAML Response
4. Ory Polis validates assertion, creates/updates identity in Ory Kratos
5. User redirected back to application with active session
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Polis** | SAML Service Provider. Manages SSO connections to Entra ID and organization-level authentication policies. |
| **Ory Kratos** | Identity management. Stores identities from Entra ID SAML assertions, maps attributes to identity traits. |
| **Ory Hydra** | OAuth2/OIDC token issuance for downstream applications after SSO. |

## Prerequisites

- **Microsoft Entra ID Access**: Global Administrator, Cloud Application Administrator, or Application Administrator role
- **Entra ID Subscription**: Any tier (Free, P1, P2). Conditional Access requires P1+.
- **Ory Network Account**: Active project with Polis enabled
- **Verified Domain**: Organization email domain verified in Ory Network
- **Tenant Information**: Your Entra ID tenant ID (found in Azure Portal > Entra ID > Overview)

## Configuration

### Step 1: Obtain Ory Polis SP Metadata

```
https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata
```

Key values:
- **Entity ID**: `https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata`
- **ACS URL (Reply URL)**: `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs`

### Step 2: Create an Enterprise Application in Entra ID

1. Sign in to the [Azure Portal](https://portal.azure.com/)
2. Navigate to **Microsoft Entra ID > Enterprise applications**
3. Click **New application**
4. Click **Create your own application**
5. Enter a name (e.g., "Ory Network SSO")
6. Select **Integrate any other application you don't find in the gallery (Non-gallery)**
7. Click **Create**

### Step 3: Configure SAML SSO in Entra ID

1. In the Enterprise Application, go to **Single sign-on**
2. Select **SAML**
3. Edit **Basic SAML Configuration**:

| Field | Value |
|-------|-------|
| **Identifier (Entity ID)** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata` |
| **Reply URL (ACS URL)** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs` |
| **Sign on URL** | `https://{your-ory-project-slug}.projects.oryapis.com/self-service/login/browser` (optional) |
| **Relay State** | (leave empty) |
| **Logout URL** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/slo` (optional) |

4. Click **Save**

### Step 4: Configure Attributes & Claims

Click **Edit** on **Attributes & Claims**:

| Claim Name | Source Attribute |
|------------|-----------------|
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` | `user.mail` |
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname` | `user.givenname` |
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname` | `user.surname` |
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name` | `user.displayname` |
| `http://schemas.microsoft.com/ws/2008/06/identity/claims/groups` | `user.groups` (optional) |

**Unique User Identifier (Name ID)**:
- Source: Attribute
- Source attribute: `user.mail`
- Name identifier format: Email address

### Step 5: Download Entra ID Federation Metadata

From the SAML SSO configuration page:
1. In **SAML Certificates** section, download **Federation Metadata XML**
2. Note the **App Federation Metadata URL**:
   ```
   https://login.microsoftonline.com/{tenant-id}/federationmetadata/2007-06/federationmetadata.xml?appid={app-id}
   ```
3. Download the **Certificate (Base64)** for manual configuration

### Step 6: Assign Users and Groups

1. Go to **Users and groups** in the Enterprise Application
2. Click **Add user/group**
3. Select users or groups who should have access
4. Click **Assign**

### Step 7: Configure Ory Polis SSO Connection

```bash
# Create SSO connection with Entra ID metadata URL
ory create sso-connection \
  --project <project-id> \
  --provider saml \
  --label "Microsoft Entra ID SSO" \
  --idp-metadata-url "https://login.microsoftonline.com/{tenant-id}/federationmetadata/2007-06/federationmetadata.xml?appid={app-id}" \
  --organization-id <org-id>

# Map email domain
ory update organization \
  --project <project-id> \
  --id <org-id> \
  --domains "yourdomain.com"
```

## Technical Details

### SAML Attribute Mapping

| Entra ID Attribute | SAML Claim URI | Ory Identity Trait |
|-------------------|---------------|--------------------|
| `user.mail` | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` | `traits.email` |
| `user.givenname` | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname` | `traits.name.first` |
| `user.surname` | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname` | `traits.name.last` |
| `user.displayname` | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name` | `traits.name.full` |
| `user.objectid` | `http://schemas.microsoft.com/identity/claims/objectidentifier` | `metadata_public.entra_object_id` |
| `user.groups` | `http://schemas.microsoft.com/ws/2008/06/identity/claims/groups` | `metadata_public.groups` |
| `user.userprincipalname` | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn` | `metadata_public.upn` |

### SAML Assertion Details

- **NameID Format**: `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`
- **Binding**: HTTP-POST for ACS, HTTP-Redirect for AuthnRequest
- **Signature Algorithm**: RSA-SHA256
- **Token Signing Certificate**: Entra ID auto-rotates certificates; Ory consumes metadata dynamically
- **Assertion Lifetime**: Default 1 hour (configurable in Entra ID)
- **Issuer**: `https://sts.windows.net/{tenant-id}/`

### Sample Entra ID Federation Metadata Snippet

```xml
<EntityDescriptor entityID="https://sts.windows.net/{tenant-id}/"
  xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>
            <!-- Entra ID token signing certificate (Base64 encoded) -->
          </X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <SingleLogoutService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://login.microsoftonline.com/{tenant-id}/saml2"/>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://login.microsoftonline.com/{tenant-id}/saml2"/>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="https://login.microsoftonline.com/{tenant-id}/saml2"/>
  </IDPSSODescriptor>
</EntityDescriptor>
```

### Conditional Access Integration

When Entra ID Conditional Access policies are active, they apply at the IdP layer before the SAML assertion is issued. Common policies include:
- Require MFA for the Ory Network enterprise application
- Block sign-in from untrusted locations
- Require compliant/hybrid-joined devices
- Risk-based policies (sign-in risk, user risk)

These are transparent to Ory -- the user must satisfy Conditional Access before Entra ID issues the assertion.

## Testing

### 1. Verify Metadata

```bash
# Ory SP metadata
curl -s https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata | xmllint --format -

# Entra ID IdP metadata
curl -s "https://login.microsoftonline.com/{tenant-id}/federationmetadata/2007-06/federationmetadata.xml?appid={app-id}" | xmllint --format -
```

### 2. Test SP-Initiated SSO

1. Navigate to your application login page
2. Enter an email from your Entra ID tenant domain
3. You should be redirected to Microsoft's login page
4. Authenticate (satisfy Conditional Access if applicable)
5. Verify redirect to your application with an active session

### 3. Test from Entra ID (IdP-Initiated)

1. Go to [myapps.microsoft.com](https://myapps.microsoft.com)
2. Click the Ory Network application tile
3. Verify SSO completes successfully

### 4. Verify in Ory

```bash
ory list identities --project <project-id> --format json | \
  jq '.[] | select(.traits.email == "user@yourdomain.com")'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **AADSTS700016: Application not found** | Incorrect app ID or app not in correct tenant | Verify the application exists in the correct Entra ID tenant |
| **AADSTS50105: User not assigned** | User/group not assigned to the enterprise application | Assign the user or their group in Entra ID > Enterprise App > Users and groups |
| **Invalid signature** | Certificate rotation | Entra ID rotates certificates; re-download federation metadata and update Ory SSO connection |
| **Audience restriction mismatch** | Entity ID mismatch | Ensure Identifier (Entity ID) in Entra ID matches Ory's SP Entity ID |
| **Claims missing** | Attributes not configured | Edit Attributes & Claims in Entra ID to include required attributes |
| **Conditional Access block** | Policy blocking sign-in | Review Conditional Access sign-in logs in Entra ID > Sign-in logs |
| **Clock skew** | Time synchronization issues | Rare with cloud services; check assertion `NotBefore`/`NotOnOrAfter` timestamps |
| **Groups claim too large** | Too many groups (150+ limit for SAML) | Use group filtering or app roles instead of group claims |

## Resources

- [Ory Polis Microsoft Entra ID SSO Documentation](https://www.ory.sh/docs/polis/sso-providers/azure)
- [Ory Polis SSO Overview](https://www.ory.sh/docs/polis/sso)
- [Microsoft Entra ID SAML SSO Documentation](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/add-application-portal-setup-sso)
- [Configure SAML-based SSO in Entra ID](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-saml-sso)
- [Entra ID SAML Token Claims Reference](https://learn.microsoft.com/en-us/entra/identity-platform/reference-saml-tokens)
- [Entra ID Conditional Access](https://learn.microsoft.com/en-us/entra/identity/conditional-access/overview)
- [Ory CLI Reference](https://www.ory.sh/docs/cli)
