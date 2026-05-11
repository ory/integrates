# HID Global Identity Services SSO Integration with Ory Network

## Overview

HID Global is a leader in trusted identity solutions, providing both physical and digital identity management. HID Global's identity services unify physical access (badge readers, smart cards, mobile credentials) with digital identity (SSO, MFA, certificate-based authentication). This makes HID Global a unique IdP for organizations in government, healthcare, financial services, and manufacturing where both physical facility access and digital application access must be governed by a unified identity.

This integration configures HID Global identity services as an IdP (via SAML 2.0, OIDC, or SCIM) with Ory Polis acting as the Service Provider. Key HID Global capabilities:

- SAML 2.0 and OIDC federation
- SCIM user provisioning
- Physical + digital identity convergence (single identity for building access and app SSO)
- PKI and certificate-based authentication
- FIDO2/WebAuthn support
- HID Approve (mobile push MFA)
- Government-grade identity assurance (PIV, CAC, FIPS 201)
- ActivID authentication platform

## Integration Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Application   │────1───▶│   Ory Polis     │────2───▶│  HID Global     │
│   (Your App)    │         │ (SAML SP /      │         │  Identity       │
│                 │◀───5────│  OIDC RP)       │◀───3────│  Services       │
│                 │         │                 │         │  (IdP)          │
└─────────────────┘         └────────┬────────┘         └────────┬────────┘
                                     │                           │
                                     4                    ┌──────▼──────┐
                                     │                    │  Physical   │
                            ┌────────▼────────┐           │  Access     │
                            │  Ory Identity   │           │  Control    │
                            │  (Kratos)       │           │  (Badges,   │
                            │  User Created/  │           │  Smart Cards│
                            │  Updated        │           │  Mobile)    │
                            └─────────────────┘           └─────────────┘

Flow:
1. User accesses application, redirected to Ory Polis login
2. Ory Polis redirects to HID Global authentication
3. User authenticates via HID (password, certificate, FIDO2, mobile push),
   HID returns SAML Response or OIDC tokens
4. Ory Polis validates response, creates/updates identity in Ory Kratos
5. User redirected back to application with active session
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Polis** | SAML SP / OIDC RP. Manages the SSO connection to HID Global. |
| **Ory Kratos** | Identity management. Stores identities from HID authentication events. |
| **Ory Hydra** | OAuth2/OIDC token issuance for downstream applications. |

## Prerequisites

- **HID Global Account**: Administrative access to HID Authentication Service or ActivID platform
- **HID Global License**: License that includes federation/SSO capabilities
- **Ory Network Account**: Active project with Polis enabled
- **Verified Domain**: Organization email domain verified in Ory Network
- **Network Access**: HID Global services accessible from Ory Network
- **Certificates**: If using certificate-based auth, PKI infrastructure in place

## Configuration

### SAML Configuration

#### Step 1: Obtain Ory SP Metadata

```
https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata
```

Key values:
- **ACS URL**: `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs`
- **Entity ID**: `https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata`

#### Step 2: Configure HID Global as SAML IdP

1. Log in to HID Authentication Service Admin Console
2. Navigate to **Applications** or **Service Provider** configuration
3. Create a new Service Provider entry for Ory Network:

| Field | Value |
|-------|-------|
| **SP Entity ID** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata` |
| **ACS URL** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs` |
| **NameID Format** | `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` |
| **Signature Algorithm** | RSA-SHA256 |
| **Sign Assertion** | Yes |
| **Sign Response** | Yes |

Or import Ory SP metadata XML for automatic configuration.

#### Step 3: Configure Attribute Mapping

| HID User Attribute | SAML Attribute Name |
|-------------------|-------------------|
| Email | `email` |
| First Name | `firstName` |
| Last Name | `lastName` |
| Employee ID | `employeeId` |
| Card Number | `cardNumber` |
| User Principal Name | `upn` |

#### Step 4: Download HID IdP Metadata

Export the SAML IdP metadata from HID Authentication Service. The metadata includes:
- IdP Entity ID
- SSO endpoint URL
- Signing certificate

#### Step 5: Configure Ory Polis (SAML)

```bash
ory create sso-connection \
  --project <project-id> \
  --provider saml \
  --label "HID Global SSO" \
  --idp-metadata-file ./hid-global-metadata.xml \
  --organization-id <org-id>
```

---

### OIDC Configuration

#### Step 1: Create an OIDC Client in HID

1. In HID Authentication Service, create an OIDC/OAuth2 client
2. Set redirect URI:
   ```
   https://{your-ory-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/hid-global
   ```
3. Note the Client ID and Client Secret

#### Step 2: HID OIDC Discovery

The OIDC discovery endpoint varies by HID deployment:
```
https://{hid-instance}/.well-known/openid-configuration
```

#### Step 3: Configure Ory Polis (OIDC)

```bash
ory create sso-connection \
  --project <project-id> \
  --provider oidc \
  --label "HID Global OIDC SSO" \
  --issuer-url "https://{hid-instance}" \
  --client-id "<client-id>" \
  --client-secret "<client-secret>" \
  --scopes "openid,profile,email" \
  --organization-id <org-id>
```

---

### Map Email Domain

```bash
ory update organization \
  --project <project-id> \
  --id <org-id> \
  --domains "yourdomain.com"
```

## Technical Details

### SAML Attribute Mapping

| HID Attribute | SAML Attribute Name | Ory Identity Trait |
|--------------|--------------------|--------------------|
| Email | `email` | `traits.email` |
| First Name | `firstName` | `traits.name.first` |
| Last Name | `lastName` | `traits.name.last` |
| Employee ID | `employeeId` | `metadata_public.employee_id` |
| Card Number | `cardNumber` | `metadata_public.hid_card_number` |
| UPN | `upn` | `metadata_public.upn` |
| Credential Type | `credentialType` | `metadata_public.hid_credential_type` |
| Organization Unit | `ou` | `metadata_public.org_unit` |

### OIDC Claim Mapping

| HID OIDC Claim | Ory Identity Trait |
|---------------|-------------------|
| `sub` | `metadata_public.hid_sub` |
| `email` | `traits.email` |
| `given_name` | `traits.name.first` |
| `family_name` | `traits.name.last` |
| `employee_id` | `metadata_public.employee_id` |

### SCIM Provisioning

HID Global supports SCIM 2.0 for user provisioning:
- **Endpoint**: `https://{hid-instance}/scim/v2`
- **Operations**: Create, Read, Update, Delete, Search
- **Resources**: Users, Groups

SCIM can be used alongside SSO to keep Ory identities synchronized with HID Global's directory.

### SAML Assertion Details

- **NameID Format**: `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`
- **Binding**: HTTP-POST for ACS, HTTP-Redirect for AuthnRequest
- **Signature Algorithm**: RSA-SHA256
- **Certificate-Based Auth**: When users authenticate via PIV/CAC/smart card, the SAML assertion includes the authentication context class indicating certificate-based authentication

### Authentication Methods

HID Global supports multiple authentication methods, which are transparent to Ory:

| Method | SAML AuthnContext |
|--------|------------------|
| Password | `urn:oasis:names:tc:SAML:2.0:ac:classes:Password` |
| Certificate (PIV/CAC) | `urn:oasis:names:tc:SAML:2.0:ac:classes:X509` |
| FIDO2/WebAuthn | `urn:oasis:names:tc:SAML:2.0:ac:classes:FIDO` |
| Mobile Push (HID Approve) | `urn:oasis:names:tc:SAML:2.0:ac:classes:MobileTwoFactorContract` |
| OTP | `urn:oasis:names:tc:SAML:2.0:ac:classes:TimeSyncToken` |

## Testing

### 1. Test SP-Initiated SSO

1. Navigate to your application login page
2. Enter an email from your HID-managed domain
3. Authenticate at HID (using appropriate method: password, smart card, FIDO2, etc.)
4. Verify redirect with active session

### 2. Verify Identity

```bash
ory list identities --project <project-id> --format json | \
  jq '.[] | select(.traits.email == "user@yourdomain.com")'
```

### 3. Test Different Authentication Methods

If HID is configured with multiple auth methods, test each:
- Password-based login
- Smart card / certificate login
- FIDO2 security key
- HID Approve mobile push

### 4. Test SCIM Provisioning (if configured)

Verify that user creation/updates in HID are reflected in Ory identities.

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **ACS URL mismatch** | URL not matching | Verify ACS URL in HID config matches Ory exactly |
| **Entity ID mismatch** | Audience mismatch | Ensure SP Entity ID matches Ory's metadata Entity ID |
| **Certificate auth fails** | PKI trust chain issue | Verify intermediate and root CA certificates are trusted |
| **Smart card not recognized** | Driver/middleware issue | Ensure HID middleware is installed on client device |
| **Signing certificate error** | Expired IdP certificate | Update the signing certificate in HID and re-export metadata |
| **SCIM sync failure** | Network or auth issue | Verify SCIM endpoint connectivity and bearer token |
| **Clock skew** | Time synchronization | Sync HID server to NTP source |
| **Missing attributes** | Mapping not configured | Add required attribute mappings in HID SP configuration |

## Resources

- [Ory Polis SSO Overview](https://www.ory.sh/docs/polis/sso)
- [HID Global Authentication Service](https://www.hidglobal.com/solutions/authentication-service)
- [HID ActivID Platform](https://www.hidglobal.com/products/software/activid)
- [HID Global SAML Federation](https://docs.hidglobal.com/)
- [HID Global SCIM Documentation](https://docs.hidglobal.com/)
- [Ory CLI Reference](https://www.ory.sh/docs/cli)
- [SAML 2.0 Specification](http://docs.oasis-open.org/security/saml/v2.0/)
