# Microsoft AD FS SAML SSO Integration with Ory Network

## Overview

Microsoft Active Directory Federation Services (AD FS) is an on-premises identity federation solution that extends Active Directory identities to cloud applications. AD FS is widely used by enterprises that maintain on-premises Active Directory infrastructure and need to provide SSO to cloud-based applications without migrating to a fully cloud-based IdP.

This integration configures AD FS as a SAML 2.0 Identity Provider with Ory Polis acting as a SAML Service Provider (Relying Party in AD FS terminology). It is the preferred approach for organizations that:

- Must keep identity data on-premises for regulatory or compliance reasons
- Have existing AD FS infrastructure serving other applications
- Are in a hybrid identity scenario alongside Microsoft Entra ID
- Require on-premises MFA solutions (e.g., Azure MFA Server, RSA SecurID)

## Integration Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Application   │────1───▶│   Ory Polis     │────2───▶│  Microsoft      │
│   (Your App)    │         │   (SAML SP)     │         │  AD FS Server   │
│                 │◀───5────│                 │◀───3────│  (On-Premises)  │
│                 │         │                 │         │                 │
└─────────────────┘         └────────┬────────┘         └────────┬────────┘
                                     │                           │
                                     4                           │
                                     │                    ┌──────▼──────┐
                            ┌────────▼────────┐           │  Active     │
                            │  Ory Identity   │           │  Directory  │
                            │  (Kratos)       │           │  (On-Prem)  │
                            │  User Created/  │           └─────────────┘
                            │  Updated        │
                            └─────────────────┘

Flow:
1. User accesses application, redirected to Ory Polis login
2. Ory Polis generates SAML AuthnRequest, redirects to AD FS
3. User authenticates against on-premises Active Directory via AD FS,
   AD FS returns SAML Response
4. Ory Polis validates assertion, creates/updates identity in Ory Kratos
5. User redirected back to application with active session
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Polis** | SAML Service Provider (Relying Party). Manages the SSO connection to AD FS. |
| **Ory Kratos** | Identity management. Stores identities from AD FS SAML assertions. |
| **Ory Hydra** | OAuth2/OIDC token issuance for downstream applications. |

## Prerequisites

- **AD FS Server**: AD FS 3.0 (Windows Server 2012 R2) or later. AD FS 4.0+ (Server 2016+) recommended.
- **AD FS Admin Access**: Local administrator on the AD FS server or delegated AD FS management rights
- **Network Connectivity**: AD FS server must be accessible from the internet (typically via Web Application Proxy or AD FS Proxy)
- **SSL Certificate**: Valid SSL/TLS certificate on the AD FS service endpoint
- **Ory Network Account**: Active project with Polis enabled
- **Verified Domain**: Organization email domain verified in Ory Network
- **AD FS Federation Metadata URL**: Typically `https://adfs.yourdomain.com/FederationMetadata/2007-06/FederationMetadata.xml`

## Configuration

### Step 1: Obtain Ory Polis SP Metadata

```
https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata
```

Key values:
- **Entity ID (Relying Party Identifier)**: `https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata`
- **ACS URL (SAML Assertion Consumer Endpoint)**: `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs`

### Step 2: Add Relying Party Trust in AD FS

**Option A: Using Federation Metadata (Recommended)**

1. Open **AD FS Management** console
2. Navigate to **Trust Relationships > Relying Party Trusts**
3. Click **Add Relying Party Trust**
4. Select **Claims aware** and click **Start**
5. Select **Import data about the relying party published online or on a local network**
6. Enter the Ory SP metadata URL:
   ```
   https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata
   ```
7. Enter a display name (e.g., "Ory Network SSO")
8. Configure access control (Permit everyone or select specific users/groups)
9. Click **Close** to finish

**Option B: Manual Configuration**

1. Select **Enter data about the relying party manually**
2. Enter display name: "Ory Network SSO"
3. Select **AD FS profile**
4. Skip token encryption certificate (optional)
5. Enable SAML 2.0 protocol
6. Set SAML 2.0 SSO service URL:
   ```
   https://{your-ory-project-slug}.projects.oryapis.com/saml/acs
   ```
7. Add Relying Party Trust Identifier:
   ```
   https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata
   ```

### Step 3: Configure Claim Issuance Rules

Edit the Relying Party Trust and add the following claim rules:

**Rule 1: Send LDAP Attributes as Claims**
- Claim rule template: **Send LDAP Attributes as Claims**
- Claim rule name: "LDAP Attributes"
- Attribute store: Active Directory

| LDAP Attribute | Outgoing Claim Type |
|---------------|-------------------|
| E-Mail-Addresses | E-Mail Address |
| Given-Name | Given Name |
| Surname | Surname |
| Display-Name | Name |
| SAM-Account-Name | Windows Account Name |
| Token-Groups - Unqualified Names | Group |

**Rule 2: Transform NameID**
- Claim rule template: **Transform an Incoming Claim**
- Incoming claim type: E-Mail Address
- Outgoing claim type: Name ID
- Outgoing name ID format: Email
- Pass through all claim values

Or use a custom rule:

```
c:[Type == "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"]
=> issue(Type = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
   Issuer = c.Issuer, OriginalIssuer = c.OriginalIssuer, Value = c.Value,
   ValueType = c.ValueType,
   Properties["http://schemas.xmlsoap.org/ws/2005/05/identity/claimproperties/format"]
   = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress");
```

### Step 4: Configure Signing

In the Relying Party Trust properties:
1. Go to the **Signature** tab
2. Ensure SHA-256 is selected as the hash algorithm
3. Go to **Advanced** tab
4. Set Secure hash algorithm to **SHA-256**

### Step 5: Export AD FS Federation Metadata

The AD FS metadata URL is typically:
```
https://adfs.yourdomain.com/FederationMetadata/2007-06/FederationMetadata.xml
```

Verify it is accessible:
```bash
curl -s https://adfs.yourdomain.com/FederationMetadata/2007-06/FederationMetadata.xml | xmllint --format -
```

### Step 6: Configure Ory Polis SSO Connection

```bash
# Using the AD FS metadata URL
ory create sso-connection \
  --project <project-id> \
  --provider saml \
  --label "Microsoft AD FS SSO" \
  --idp-metadata-url "https://adfs.yourdomain.com/FederationMetadata/2007-06/FederationMetadata.xml" \
  --organization-id <org-id>

# If AD FS metadata is not publicly accessible, download and upload the file
ory create sso-connection \
  --project <project-id> \
  --provider saml \
  --label "Microsoft AD FS SSO" \
  --idp-metadata-file ./adfs-metadata.xml \
  --organization-id <org-id>

# Map email domain
ory update organization \
  --project <project-id> \
  --id <org-id> \
  --domains "yourdomain.com"
```

## Technical Details

### SAML Attribute Mapping

| AD / AD FS Attribute | SAML Claim URI | Ory Identity Trait |
|---------------------|---------------|--------------------|
| E-Mail-Addresses | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` | `traits.email` |
| Given-Name | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname` | `traits.name.first` |
| Surname | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname` | `traits.name.last` |
| Display-Name | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name` | `traits.name.full` |
| SAM-Account-Name | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/windowsaccountname` | `metadata_public.sam_account` |
| Token-Groups | `http://schemas.xmlsoap.org/claims/Group` | `metadata_public.groups` |
| objectGUID | `http://schemas.microsoft.com/identity/claims/objectidentifier` | `metadata_public.ad_object_id` |

### SAML Assertion Details

- **NameID Format**: `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`
- **Binding**: HTTP-POST for ACS, HTTP-Redirect for AuthnRequest
- **Signature Algorithm**: RSA-SHA256
- **Token Signing Certificate**: Managed by AD FS (check expiry regularly)
- **Default Token Lifetime**: 60 minutes
- **Issuer**: `http://adfs.yourdomain.com/adfs/services/trust`

### Sample AD FS Metadata Snippet

```xml
<EntityDescriptor entityID="http://adfs.yourdomain.com/adfs/services/trust"
  xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>
            <!-- AD FS token signing certificate (Base64 encoded) -->
          </X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <SingleLogoutService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://adfs.yourdomain.com/adfs/ls/"/>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://adfs.yourdomain.com/adfs/ls/"/>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="https://adfs.yourdomain.com/adfs/ls/"/>
  </IDPSSODescriptor>
</EntityDescriptor>
```

## Testing

### 1. Verify AD FS Metadata

```bash
# If AD FS is internet-accessible
curl -s https://adfs.yourdomain.com/FederationMetadata/2007-06/FederationMetadata.xml | xmllint --format -
```

### 2. Test SP-Initiated SSO

1. Open your application login page
2. Enter an email from your AD domain
3. You should be redirected to the AD FS login page
4. Authenticate with AD credentials
5. Verify redirect back to your application with an active session

### 3. Test from AD FS IdP-Initiated Page

Navigate to:
```
https://adfs.yourdomain.com/adfs/ls/idpinitiatedsignon.aspx
```

Select the Ory Network relying party and sign in.

### 4. Verify in Ory

```bash
ory list identities --project <project-id> --format json | \
  jq '.[] | select(.traits.email == "user@yourdomain.com")'
```

### 5. AD FS Event Logs

On the AD FS server, check:
- **Event Viewer > Applications and Services Logs > AD FS > Admin**
- Event IDs 1200 (successful token issuance), 364 (failed), 325 (certificate issues)

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **"MSIS7065: No certificate found"** | AD FS signing certificate expired | Renew the token-signing certificate in AD FS Management > Certificates |
| **Relying Party Trust not found** | Incorrect Entity ID | Verify the Relying Party Identifier matches Ory's Entity ID exactly |
| **Claims not sent** | Missing claim issuance rules | Add LDAP Attributes and NameID transform rules as described above |
| **Clock skew errors** | AD FS server time drift | Ensure AD FS server is synced to an NTP source; default skew tolerance is 5 minutes |
| **Certificate validation failed** | Self-signed or untrusted certificate | Ensure AD FS uses a certificate from a trusted CA; or export and upload the signing cert to Ory |
| **WAP/Proxy timeout** | Network connectivity issues | Verify Web Application Proxy health and connectivity to AD FS farm |
| **"The SAML request is invalid"** | Metadata mismatch | Re-import the Ory SP metadata in AD FS and update the Relying Party Trust |
| **User not in AD** | Account disabled or deleted | Verify the user account exists and is enabled in Active Directory |
| **Windows Integrated Auth issues** | Browser not configured for Intranet | Add AD FS URL to browser's Local Intranet zone or use Forms authentication |

## Resources

- [Ory Polis Microsoft AD FS SSO Documentation](https://www.ory.sh/docs/polis/sso-providers/microsoft-adfs)
- [Ory Polis SSO Overview](https://www.ory.sh/docs/polis/sso)
- [AD FS SAML Relying Party Configuration](https://learn.microsoft.com/en-us/windows-server/identity/ad-fs/operations/create-a-relying-party-trust)
- [AD FS Claim Rules](https://learn.microsoft.com/en-us/windows-server/identity/ad-fs/technical-reference/the-role-of-claim-rules)
- [AD FS Troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/windows-server/identity/ad-fs-troubleshooting)
- [Ory CLI Reference](https://www.ory.sh/docs/cli)
