# Generic SAML 2.0 SP Integration with Ory Network

## Overview

Ory Network supports SAML 2.0 Service Provider (SP) integration via Ory Polis, enabling enterprise SSO with any SAML 2.0 compliant Identity Provider (IdP). This guide covers configuring Ory as a SAML SP for any IdP, including ADFS, Shibboleth, SimpleSAMLphp, PingFederate, OneLogin, or custom SAML implementations.

Key capabilities:
- SP-initiated SSO (user starts at Ory, redirected to IdP)
- IdP-initiated SSO (user starts at IdP, lands at Ory)
- SAML attribute-to-trait mapping
- Signed assertions and responses (RSA-SHA256)
- Organization-based SSO connection management

Ory documentation: https://www.ory.sh/docs/polis/sso

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │
│   User       │─1─▶│  Ory Polis   │─2─▶│  SAML IdP    │
│   Browser    │    │  (SAML SP)   │    │  (Generic)   │
│              │    │              │    │              │
│              │◀─5─│              │◀─3─│              │
└──────────────┘    └──────┬───────┘    └──────────────┘
                           │
                           4 (validate assertion, create identity)
                           │
                    ┌──────▼───────┐
                    │  Ory Kratos  │
                    │  Identity    │
                    │  Created/    │
                    │  Updated     │
                    └──────────────┘

Flow:
1. User accesses application, redirected to Ory login
2. Ory generates SAML AuthnRequest, redirects to IdP
3. User authenticates at IdP; IdP returns SAML Response
4. Ory validates assertion, creates/updates identity
5. User redirected to application with active session
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Polis** | SAML Service Provider. Manages SSO connections, processes SAML assertions. |
| **Ory Kratos** | Identity management. Stores identities created from SAML assertions. |
| **Ory Hydra** | (Optional) Issues OAuth2/OIDC tokens to downstream applications after SAML SSO. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project with Polis enabled
- **SAML IdP**: Any SAML 2.0 compliant Identity Provider
- **IdP Metadata**: XML metadata or individual endpoint URLs and certificate
- **Email Domain**: Verified domain for organization-based SSO routing

## Configuration

### Step 1: Obtain Ory SP Metadata

Retrieve your Ory SAML SP metadata:

```bash
# Metadata URL
https://<your-ory-project>.projects.oryapis.com/saml/metadata

# Download metadata
curl -o ory-sp-metadata.xml \
  https://<your-ory-project>.projects.oryapis.com/saml/metadata
```

Key values from the metadata:
- **Entity ID**: `https://<your-ory-project>.projects.oryapis.com/saml/metadata`
- **ACS URL**: `https://<your-ory-project>.projects.oryapis.com/saml/acs`
- **SLO URL**: `https://<your-ory-project>.projects.oryapis.com/saml/slo` (if supported)

### Step 2: Configure Your SAML IdP

Provide the following to your IdP administrator:

| Setting | Value |
|---------|-------|
| **SP Entity ID** | `https://<your-ory-project>.projects.oryapis.com/saml/metadata` |
| **ACS URL** | `https://<your-ory-project>.projects.oryapis.com/saml/acs` |
| **ACS Binding** | `urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST` |
| **NameID Format** | `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` |
| **Signature Algorithm** | RSA-SHA256 |
| **Sign Assertions** | Yes |
| **Encrypt Assertions** | Optional (recommended for sensitive data) |

**Required SAML attributes to release:**

| Attribute Name | SAML Attribute URI | Required |
|---------------|-------------------|----------|
| Email | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` | Yes |
| First Name | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname` | Recommended |
| Last Name | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname` | Recommended |
| Display Name | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name` | Optional |
| Groups | `http://schemas.xmlsoap.org/claims/Group` | Optional |

### Step 3: Create SSO Connection in Ory

**Using IdP Metadata URL (recommended):**

```bash
ory create sso-connection \
  --project <project-id> \
  --provider saml \
  --label "Corporate SAML SSO" \
  --idp-metadata-url "https://idp.example.com/saml/metadata" \
  --organization-id <org-id>
```

**Using IdP Metadata File:**

```bash
ory create sso-connection \
  --project <project-id> \
  --provider saml \
  --label "Corporate SAML SSO" \
  --idp-metadata-file ./idp-metadata.xml \
  --organization-id <org-id>
```

**Using Manual Configuration (no metadata):**

```bash
ory create sso-connection \
  --project <project-id> \
  --provider saml \
  --label "Corporate SAML SSO" \
  --idp-sso-url "https://idp.example.com/saml/sso" \
  --idp-entity-id "https://idp.example.com/saml/metadata" \
  --idp-certificate-file ./idp-signing-cert.pem \
  --organization-id <org-id>
```

### Step 4: Map Email Domains to Organization

```bash
# Create organization (if not exists)
ory create organization \
  --project <project-id> \
  --label "Example Corp" \
  --domains "example.com,example.org"

# Or update existing organization
ory update organization \
  --project <project-id> \
  --id <org-id> \
  --domains "example.com,example.org"
```

### Step 5: Configure Attribute Mapping

Ory Polis maps SAML attributes to identity traits. The default mapping handles common attribute URIs. For custom attributes, configure mapping in the Ory Console:

1. Navigate to **Authentication > Enterprise SSO**
2. Select your SSO connection
3. Under **Attribute Mapping**, configure:

| SAML Attribute | Ory Trait |
|----------------|-----------|
| `emailaddress` claim | `traits.email` |
| `givenname` claim | `traits.name.first` |
| `surname` claim | `traits.name.last` |

## SAML Assertion Details

| Parameter | Value |
|-----------|-------|
| **NameID Format** | `emailAddress` (recommended) or `persistent` |
| **AuthnRequest Binding** | HTTP-Redirect |
| **ACS Binding** | HTTP-POST |
| **Signature Algorithm** | RSA-SHA256 |
| **Digest Algorithm** | SHA256 |
| **Clock Skew Tolerance** | 60 seconds (default) |

## Sample IdP Metadata Structure

```xml
<EntityDescriptor entityID="https://idp.example.com/saml/metadata"
  xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <IDPSSODescriptor
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>
            <!-- Base64-encoded signing certificate -->
          </X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://idp.example.com/saml/sso"/>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="https://idp.example.com/saml/sso"/>
  </IDPSSODescriptor>
</EntityDescriptor>
```

## Testing

### 1. Verify Metadata Exchange

```bash
# Ory SP metadata
curl -s https://<your-ory-project>.projects.oryapis.com/saml/metadata

# IdP metadata
curl -s https://idp.example.com/saml/metadata
```

### 2. Test SP-Initiated SSO

1. Navigate to your application login
2. Enter an email address matching the configured domain (e.g., `user@example.com`)
3. You should be redirected to the IdP login page
4. Authenticate at the IdP
5. Verify redirect back to your application with an active session

### 3. Verify Identity

```bash
ory list identities --project <project-id> --format json | \
  jq '.[] | select(.traits.email == "user@example.com")'
```

### 4. Debug SAML Response

```bash
# Check sessions for SSO user
ory list sessions --project <project-id> --identity-id <identity-id>
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **"Invalid SAML Response"** | Audience mismatch | IdP Audience/SP Entity ID must match Ory's Entity ID exactly |
| **"Certificate validation failed"** | IdP certificate changed | Update SSO connection with new IdP metadata or certificate |
| **Clock skew error** | Server time difference | Default tolerance is 60s; check IdP server time sync |
| **No SSO connection found** | Domain not mapped | Verify domain is associated with the organization |
| **User not created** | Required attribute missing | Ensure `email` attribute is in the SAML assertion |
| **Redirect loop** | ACS URL wrong | Confirm ACS URL at IdP matches `https://<slug>.projects.oryapis.com/saml/acs` |
| **Signature validation fails** | Wrong certificate or algorithm | Verify signing certificate matches; ensure RSA-SHA256 |

## Common IdP Configuration Examples

### ADFS (Active Directory Federation Services)

1. Add Relying Party Trust using Ory SP metadata URL
2. Configure claim rules to send email, given name, surname
3. Set NameID to email address

### Shibboleth

```xml
<!-- shibboleth2.xml: Add Ory as SP -->
<MetadataProvider type="XML"
  url="https://<your-ory-project>.projects.oryapis.com/saml/metadata"
  backingFilePath="ory-sp-metadata.xml"
  reloadInterval="3600"/>
```

### Keycloak

1. Create new Client with SAML protocol
2. Set Client ID to Ory SP Entity ID
3. Configure Valid Redirect URIs with ACS URL
4. Enable "Sign Assertions" and "Sign Documents"

## Resources

- [Ory Polis SSO Documentation](https://www.ory.sh/docs/polis/sso)
- [Ory Polis SAML Configuration](https://www.ory.sh/docs/polis/sso-providers/generic-saml)
- [Ory CLI SSO Commands](https://www.ory.sh/docs/cli/ory-create-sso-connection)
- [SAML 2.0 Core Specification](http://docs.oasis-open.org/security/saml/v2.0/saml-core-2.0-os.pdf)
- [SAML 2.0 Bindings](http://docs.oasis-open.org/security/saml/v2.0/saml-bindings-2.0-os.pdf)
