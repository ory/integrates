# Generic SAML 2.0 SP Integration with Ory Network

## Overview

This integration guide covers configuring Ory Polis as a SAML 2.0 Service Provider (SP) with any SAML 2.0-compliant Identity Provider. This is the go-to reference when your organization's IdP is not covered by one of the provider-specific guides in this directory, or when you need to understand the underlying SAML mechanics that apply to all SAML-based SSO integrations with Ory.

The SAML 2.0 standard (Security Assertion Markup Language) is the most widely adopted federation protocol for enterprise SSO. Any IdP that implements the SAML 2.0 Web Browser SSO Profile can integrate with Ory Polis using the steps in this guide.

Common IdPs that can use this generic guide:
- Shibboleth
- SimpleSAMLphp
- WSO2 Identity Server
- ForgeRock / PingForge
- IBM Security Verify
- NetIQ Access Manager
- Oracle Identity Federation
- Salesforce Identity
- Any custom SAML 2.0 IdP

## Integration Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Application   │────1───▶│   Ory Polis     │────2───▶│   Any SAML 2.0  │
│   (Your App)    │         │   (SAML SP)     │         │   Identity      │
│                 │◀───5────│                 │◀───3────│   Provider      │
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

SP-Initiated SSO Flow:
1. User accesses application, redirected to Ory Polis login
2. Ory Polis generates SAML AuthnRequest, redirects to IdP
3. User authenticates at IdP, IdP returns SAML Response with Assertion
4. Ory Polis validates assertion, creates/updates identity in Ory Kratos
5. User redirected back to application with active session
```

### Detailed SAML Protocol Flow

```
User Agent            Ory Polis (SP)              IdP
    │                      │                       │
    │──── Login ──────────▶│                       │
    │                      │                       │
    │◀── 302 Redirect ─────│                       │
    │    (SAMLRequest in    │                       │
    │     query string)     │                       │
    │                      │                       │
    │──── GET /sso ────────────────────────────────▶│
    │    (SAMLRequest)      │                       │
    │                      │                       │
    │◀────── Login Form ───────────────────────────│
    │                      │                       │
    │──── Credentials ─────────────────────────────▶│
    │                      │                       │
    │◀── POST /saml/acs ───────────────────────────│
    │    (SAMLResponse      │                       │
    │     via auto-submit   │                       │
    │     form)             │                       │
    │                      │                       │
    │──── POST /saml/acs ─▶│                       │
    │    (SAMLResponse)     │                       │
    │                      │── Validate ──┐        │
    │                      │              │        │
    │                      │◀─────────────┘        │
    │                      │                       │
    │◀── 302 Redirect ─────│                       │
    │    (Session cookie)   │                       │
    │                      │                       │
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Polis** | SAML 2.0 Service Provider. Handles SAML AuthnRequest generation, Response validation, and assertion processing. |
| **Ory Kratos** | Identity management. Creates and updates identity records from SAML assertions. |
| **Ory Hydra** | OAuth2/OIDC token issuance for downstream applications after SSO. |

## Prerequisites

- **SAML 2.0 IdP**: Any IdP that supports the SAML 2.0 Web Browser SSO Profile
- **IdP Admin Access**: Ability to create SP/Relying Party entries and configure attribute release
- **IdP Metadata**: XML metadata document from the IdP (URL or file)
- **Signing Certificate**: IdP's X.509 signing certificate (usually included in metadata)
- **Ory Network Account**: Active project with Polis enabled
- **Verified Domain**: Organization email domain verified in Ory Network

## Configuration

### Step 1: Obtain Ory Polis SP Metadata

Ory Polis exposes standard SAML SP metadata at:

```
https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata
```

This metadata contains all information the IdP needs:
- **Entity ID**: `https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata`
- **ACS URL**: `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs`
- **Signing/encryption certificates** (if applicable)
- **Supported NameID formats**
- **Supported bindings**

You can provide this URL to your IdP for automatic configuration, or download the XML:

```bash
curl -o ory-sp-metadata.xml \
  https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata
```

### Step 2: Register Ory as SP in Your IdP

The exact steps vary by IdP, but generally you need to:

1. **Import SP metadata**: Upload or link to the Ory SP metadata URL
2. **Or manually configure**:
   - SP Entity ID: `https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata`
   - ACS URL: `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs`
   - ACS Binding: `urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST`
   - NameID Format: `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`

### Step 3: Configure Attribute Release

Configure your IdP to include these attributes in the SAML assertion:

| Required / Optional | Attribute | Description |
|---------------------|-----------|-------------|
| **Required** | `email` or NameID (email format) | User's email address |
| Recommended | `firstName` or `givenName` | User's first name |
| Recommended | `lastName` or `surname` | User's last name |
| Optional | `displayName` or `name` | User's full display name |
| Optional | `groups` or `memberOf` | Group memberships |
| Optional | Custom attributes | Any additional attributes needed |

Common SAML attribute name URIs:

| Short Name | Full URI |
|-----------|----------|
| `email` | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` |
| `givenName` | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname` |
| `surname` | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname` |
| `name` | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name` |
| `groups` | `http://schemas.xmlsoap.org/claims/Group` |

### Step 4: Configure Signing

Ensure your IdP is configured to:
- **Sign the SAML Assertion**: Required
- **Sign the SAML Response**: Recommended
- **Use SHA-256**: For signature and digest algorithms
- **Include the signing certificate** in the metadata

### Step 5: Obtain IdP Metadata

Get the IdP metadata XML via one of:
- **Metadata URL**: Most IdPs expose metadata at a well-known URL
- **File download**: Export metadata from the IdP admin console
- **Manual construction**: Assemble metadata from individual values (SSO URL, Entity ID, certificate)

### Step 6: Configure Ory Polis SSO Connection

**Using metadata URL:**
```bash
ory create sso-connection \
  --project <project-id> \
  --provider saml \
  --label "Enterprise SSO" \
  --idp-metadata-url "<idp-metadata-url>" \
  --organization-id <org-id>
```

**Using metadata file:**
```bash
ory create sso-connection \
  --project <project-id> \
  --provider saml \
  --label "Enterprise SSO" \
  --idp-metadata-file ./idp-metadata.xml \
  --organization-id <org-id>
```

### Step 7: Map Email Domains

```bash
ory update organization \
  --project <project-id> \
  --id <org-id> \
  --domains "yourdomain.com"
```

### Step 8: List and Manage SSO Connections

```bash
# List all SSO connections
ory list sso-connections --project <project-id>

# Get details of a specific connection
ory get sso-connection <connection-id> --project <project-id>

# Update an SSO connection
ory update sso-connection <connection-id> \
  --project <project-id> \
  --label "Updated Label" \
  --idp-metadata-url "<new-metadata-url>"

# Delete an SSO connection
ory delete sso-connection <connection-id> --project <project-id>
```

## Technical Details

### SAML Attribute Mapping

| Common IdP Attribute | Ory Identity Trait |
|---------------------|-------------------|
| `email` / `emailaddress` / NameID (email) | `traits.email` |
| `firstName` / `givenName` / `given_name` | `traits.name.first` |
| `lastName` / `surname` / `family_name` / `sn` | `traits.name.last` |
| `displayName` / `name` / `cn` | `traits.name.full` |
| `groups` / `memberOf` / `Group` | `metadata_public.groups` |
| `department` | `metadata_public.department` |
| `title` / `jobTitle` | `metadata_public.title` |
| `phone` / `telephoneNumber` | `traits.phone` |

### SAML Protocol Requirements

| Parameter | Value |
|-----------|-------|
| **SAML Version** | 2.0 |
| **SSO Profile** | Web Browser SSO Profile |
| **AuthnRequest Binding** | HTTP-Redirect (preferred) or HTTP-POST |
| **Response/ACS Binding** | HTTP-POST (required) |
| **NameID Format** | `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` (preferred) |
| **Signature Algorithm** | RSA-SHA256 (required; SHA-1 is deprecated) |
| **Digest Algorithm** | SHA-256 |
| **Assertion** | Must be signed |
| **Encryption** | Optional (supported but not required) |
| **Clock Skew Tolerance** | 60 seconds (default) |

### SAML Metadata XML Structure

The IdP metadata should contain at minimum:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor entityID="https://idp.yourdomain.com/saml/metadata"
  xmlns="urn:oasis:names:tc:SAML:2.0:metadata">

  <IDPSSODescriptor
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"
    WantAuthnRequestsSigned="false">

    <!-- IdP Signing Certificate -->
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>
            MIIDpDCCAoygAwIBAgIGAX...
            <!-- Base64 encoded X.509 certificate -->
          </X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>

    <!-- Optional: Encryption Certificate -->
    <KeyDescriptor use="encryption">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>
            MIIDpDCCAoygAwIBAgIGAX...
          </X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>

    <!-- Single Logout Service (optional) -->
    <SingleLogoutService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://idp.yourdomain.com/saml/slo"/>

    <!-- NameID Formats -->
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:persistent</NameIDFormat>
    <NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:transient</NameIDFormat>

    <!-- SSO Endpoints -->
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://idp.yourdomain.com/saml/sso"/>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="https://idp.yourdomain.com/saml/sso"/>

  </IDPSSODescriptor>
</EntityDescriptor>
```

### Sample SAML Assertion Structure

```xml
<saml2p:Response xmlns:saml2p="urn:oasis:names:tc:SAML:2.0:protocol"
  Destination="https://{slug}.projects.oryapis.com/saml/acs"
  ID="_response_id"
  InResponseTo="_authn_request_id"
  IssueInstant="2026-01-15T10:00:00Z"
  Version="2.0">

  <saml2:Issuer xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion">
    https://idp.yourdomain.com/saml/metadata
  </saml2:Issuer>

  <saml2p:Status>
    <saml2p:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
  </saml2p:Status>

  <saml2:Assertion xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion"
    ID="_assertion_id"
    IssueInstant="2026-01-15T10:00:00Z"
    Version="2.0">

    <saml2:Issuer>https://idp.yourdomain.com/saml/metadata</saml2:Issuer>

    <!-- Signature over the Assertion -->
    <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
      <!-- ... -->
    </ds:Signature>

    <saml2:Subject>
      <saml2:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">
        user@yourdomain.com
      </saml2:NameID>
      <saml2:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml2:SubjectConfirmationData
          InResponseTo="_authn_request_id"
          NotOnOrAfter="2026-01-15T10:05:00Z"
          Recipient="https://{slug}.projects.oryapis.com/saml/acs"/>
      </saml2:SubjectConfirmation>
    </saml2:Subject>

    <saml2:Conditions
      NotBefore="2026-01-15T09:59:00Z"
      NotOnOrAfter="2026-01-15T10:05:00Z">
      <saml2:AudienceRestriction>
        <saml2:Audience>
          https://{slug}.projects.oryapis.com/saml/metadata
        </saml2:Audience>
      </saml2:AudienceRestriction>
    </saml2:Conditions>

    <saml2:AuthnStatement AuthnInstant="2026-01-15T10:00:00Z">
      <saml2:AuthnContext>
        <saml2:AuthnContextClassRef>
          urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport
        </saml2:AuthnContextClassRef>
      </saml2:AuthnContext>
    </saml2:AuthnStatement>

    <saml2:AttributeStatement>
      <saml2:Attribute Name="email">
        <saml2:AttributeValue>user@yourdomain.com</saml2:AttributeValue>
      </saml2:Attribute>
      <saml2:Attribute Name="firstName">
        <saml2:AttributeValue>Jane</saml2:AttributeValue>
      </saml2:Attribute>
      <saml2:Attribute Name="lastName">
        <saml2:AttributeValue>Doe</saml2:AttributeValue>
      </saml2:Attribute>
    </saml2:AttributeStatement>

  </saml2:Assertion>
</saml2p:Response>
```

## Testing

### 1. Verify SP Metadata

```bash
curl -s https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata | xmllint --format -
```

Verify the metadata contains correct ACS URL and Entity ID.

### 2. Verify IdP Metadata

```bash
# If metadata URL is available
curl -s "<idp-metadata-url>" | xmllint --format -
```

Check that the metadata includes SSO endpoint, signing certificate, and NameID format.

### 3. Test SP-Initiated SSO

1. Navigate to your application login page
2. Enter an email from the mapped domain
3. You should be redirected to the IdP's login page
4. Authenticate with IdP credentials
5. Verify you are redirected back with an active session

### 4. Validate with SAML Tracer

Use a browser extension like [SAML-tracer](https://addons.mozilla.org/en-US/firefox/addon/saml-tracer/) (Firefox) or [SAML Chrome Panel](https://chromewebstore.google.com/detail/saml-chrome-panel/) to inspect:
- The SAML AuthnRequest sent to the IdP
- The SAML Response returned from the IdP
- The assertion attributes and NameID

### 5. Verify Identity Creation

```bash
ory list identities --project <project-id> --format json | \
  jq '.[] | select(.traits.email == "user@yourdomain.com")'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **"Invalid SAML Response"** | Multiple possible causes | Use SAML Tracer to inspect the raw response; check signature, audience, timestamps |
| **Audience restriction mismatch** | Entity ID mismatch between IdP and SP | Ensure IdP's Audience/SP Entity ID matches `https://{slug}.projects.oryapis.com/saml/metadata` |
| **Signature validation failed** | Certificate mismatch or expiry | Verify IdP signing certificate matches what Ory has; re-import metadata |
| **"Response is not yet valid"** | Clock skew (NotBefore in the future) | Sync IdP server time to NTP; Ory allows 60-second skew |
| **"Response has expired"** | Clock skew or assertion lifetime too short | Check NotOnOrAfter timestamp; increase assertion validity at IdP |
| **NameID missing or wrong format** | IdP not sending email-format NameID | Configure NameID format to emailAddress in IdP; or map email attribute |
| **User not created** | Required attributes missing | Ensure `email` attribute or email-format NameID is present in assertion |
| **"No SSO connection found"** | Domain not mapped | Map the email domain via `ory update organization --domains` |
| **Redirect loop** | ACS URL misconfigured | Ensure ACS URL is exactly `https://{slug}.projects.oryapis.com/saml/acs` |
| **HTTP 405 on ACS** | Wrong binding (GET instead of POST) | Ensure the IdP sends the response via HTTP-POST, not HTTP-Redirect |
| **Encrypted assertion not decrypted** | Encryption key mismatch | Check that the correct encryption certificate from SP metadata is used |
| **SHA-1 signature rejected** | Deprecated algorithm | Configure IdP to use SHA-256 for signature and digest |

### SAML Debugging Checklist

1. Verify both SP and IdP metadata are valid XML
2. Confirm Entity IDs match exactly (case-sensitive, including trailing slashes)
3. Verify ACS URL is correct and uses HTTPS
4. Check IdP signing certificate is not expired
5. Confirm assertion contains email attribute or email-format NameID
6. Verify clock synchronization (NTP)
7. Check that signature algorithm is SHA-256
8. Use SAML Tracer to inspect the raw SAML messages

## Resources

- [Ory Polis Generic SAML SSO Documentation](https://www.ory.sh/docs/polis/sso-providers/generic-saml)
- [Ory Polis SSO Overview](https://www.ory.sh/docs/polis/sso)
- [SAML 2.0 Core Specification](http://docs.oasis-open.org/security/saml/v2.0/saml-core-2.0-os.pdf)
- [SAML 2.0 Bindings](http://docs.oasis-open.org/security/saml/v2.0/saml-bindings-2.0-os.pdf)
- [SAML 2.0 Profiles](http://docs.oasis-open.org/security/saml/v2.0/saml-profiles-2.0-os.pdf)
- [SAML 2.0 Metadata](http://docs.oasis-open.org/security/saml/v2.0/saml-metadata-2.0-os.pdf)
- [SAML-tracer Browser Extension](https://addons.mozilla.org/en-US/firefox/addon/saml-tracer/)
- [Ory CLI Reference](https://www.ory.sh/docs/cli)
