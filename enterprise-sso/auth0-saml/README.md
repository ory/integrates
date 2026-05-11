# Auth0 SAML SSO Integration with Ory Network

## Overview

Auth0 is a flexible identity platform that provides authentication and authorization services. When used as a SAML Identity Provider (IdP), Auth0 enables enterprise organizations to federate their existing Auth0-managed identities into applications protected by Ory Network. This integration configures Auth0 as a SAML 2.0 IdP with Ory Polis acting as the SAML Service Provider (SP).

Auth0's SAML capabilities support:
- SP-initiated and IdP-initiated SSO flows
- Custom attribute mapping and claim transformation
- Multi-factor authentication enforcement at the IdP layer
- Integration with Auth0 Actions for custom login logic

## Integration Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Application   │────1───▶│   Ory Polis     │────2───▶│   Auth0 IdP     │
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
2. Ory Polis generates SAML AuthnRequest, redirects user to Auth0
3. User authenticates at Auth0, Auth0 returns SAML Response/Assertion
4. Ory Polis validates assertion, creates/updates identity in Ory Kratos
5. User is redirected back to application with active session
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Polis** | Acts as the SAML Service Provider (SP). Manages SSO connections and organization-level authentication policies. |
| **Ory Kratos** | Identity management. Stores user identities created or updated from SAML assertions. Maps SAML attributes to identity traits. |
| **Ory Hydra** | OAuth2/OIDC provider. Issues tokens to downstream applications after SSO authentication completes. |

## Prerequisites

- **Auth0 Tenant**: An Auth0 account with administrative access
- **Auth0 Application**: A "Regular Web Application" configured in Auth0
- **Ory Network Account**: An active Ory Network project with Polis enabled
- **Domain Verified**: Your organization's email domain verified in Ory Network
- **SAML Addon Enabled**: The SAML2 Web App addon enabled on the Auth0 application
- **Certificates**: Auth0 signing certificate downloaded (available from Auth0 dashboard under Advanced Settings)

## Configuration

### Step 1: Obtain Ory Polis SP Metadata

Retrieve your Ory Polis SAML SP metadata. The metadata URL follows this pattern:

```
https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata
```

Alternatively, use the Ory CLI:

```bash
ory get saml-metadata --project <project-id>
```

Key values from the SP metadata:
- **Entity ID**: `https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata`
- **ACS URL**: `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs`

### Step 2: Configure Auth0 as SAML IdP

1. Log in to the [Auth0 Dashboard](https://manage.auth0.com/)
2. Navigate to **Applications > Applications**
3. Select your application (or create a new Regular Web Application)
4. Go to the **Addons** tab
5. Enable the **SAML2 Web App** addon
6. Configure the following settings:

**Application Callback URL:**
```
https://{your-ory-project-slug}.projects.oryapis.com/saml/acs
```

**Settings JSON:**
```json
{
  "audience": "https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata",
  "mappings": {
    "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "given_name": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
    "family_name": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"
  },
  "nameIdentifierFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
  "nameIdentifierProbes": [
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
  ],
  "signResponse": true,
  "digestAlgorithm": "sha256",
  "signatureAlgorithm": "rsa-sha256"
}
```

7. Click **Save**

### Step 3: Download Auth0 IdP Metadata

From the SAML2 Web App addon dialog in Auth0:
1. Click **Usage** tab
2. Download the **Identity Provider Metadata** XML
3. Note the **Identity Provider Login URL** and **Identity Provider Certificate**

The Auth0 SAML metadata URL follows this pattern:
```
https://{your-auth0-tenant}.auth0.com/samlp/metadata/{client-id}
```

### Step 4: Configure Ory Polis SSO Connection

Using the Ory Console:
1. Navigate to **Authentication > Enterprise SSO**
2. Click **Add SSO Connection**
3. Select **SAML** as the protocol
4. Enter the Auth0 IdP metadata URL or upload the metadata XML
5. Map the email domain(s) for this SSO connection
6. Save the configuration

Using the Ory CLI:

```bash
# Create a new SSO connection
ory create sso-connection \
  --project <project-id> \
  --provider saml \
  --label "Auth0 SAML SSO" \
  --idp-metadata-url "https://{your-auth0-tenant}.auth0.com/samlp/metadata/{client-id}" \
  --organization-id <org-id>

# Or with a local metadata file
ory create sso-connection \
  --project <project-id> \
  --provider saml \
  --label "Auth0 SAML SSO" \
  --idp-metadata-file ./auth0-metadata.xml \
  --organization-id <org-id>
```

### Step 5: Map Email Domains

```bash
ory update organization \
  --project <project-id> \
  --id <org-id> \
  --domains "yourdomain.com"
```

## Technical Details

### SAML Attribute Mapping

| Auth0 Attribute | SAML Claim URI | Ory Identity Trait |
|-----------------|---------------|--------------------|
| `email` | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` | `traits.email` |
| `given_name` | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname` | `traits.name.first` |
| `family_name` | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname` | `traits.name.last` |
| `name` | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name` | `traits.name.full` |
| `user_id` | `http://schemas.auth0.com/user_id` | `metadata_public.auth0_id` |

### SAML Assertion Details

- **NameID Format**: `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`
- **Binding**: HTTP-POST for ACS, HTTP-Redirect for AuthnRequest
- **Signature Algorithm**: RSA-SHA256
- **Digest Algorithm**: SHA256
- **Assertion Signed**: Yes
- **Response Signed**: Yes (configurable)

### Sample SAML Metadata Snippet (Auth0 IdP)

```xml
<EntityDescriptor entityID="urn:auth0:{tenant-name}"
  xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>
            <!-- Auth0 signing certificate (Base64 encoded) -->
          </X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <SingleLogoutService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://{tenant}.auth0.com/samlp/{client-id}/logout"/>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://{tenant}.auth0.com/samlp/{client-id}"/>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="https://{tenant}.auth0.com/samlp/{client-id}"/>
  </IDPSSODescriptor>
</EntityDescriptor>
```

## Testing

### 1. Verify Metadata Exchange

```bash
# Confirm Ory SP metadata is accessible
curl https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata

# Confirm Auth0 IdP metadata is accessible
curl https://{your-auth0-tenant}.auth0.com/samlp/metadata/{client-id}
```

### 2. Test SP-Initiated SSO

1. Open your application's login page
2. Enter an email address matching the mapped domain
3. You should be redirected to Auth0's login page
4. Authenticate with Auth0 credentials
5. Verify redirect back to your application with an active session

### 3. Verify Identity Creation

```bash
# List identities to confirm the SSO user was created
ory list identities --project <project-id> --format json | \
  jq '.[] | select(.traits.email == "user@yourdomain.com")'
```

### 4. Inspect SAML Response (Debug)

Enable SAML debugging in Auth0:
1. Go to **Logs > Filters**
2. Filter by event type **Success Login** or **Failed Login**
3. Inspect the SAML assertion in the log details

In Ory Network, check session details:
```bash
ory list sessions --project <project-id> --identity-id <identity-id>
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **"Invalid SAML Response"** | Audience mismatch | Verify the Auth0 SAML addon `audience` matches Ory's Entity ID exactly |
| **"Certificate validation failed"** | Expired or rotated Auth0 certificate | Download the new certificate from Auth0 and update the SSO connection in Ory |
| **Clock skew errors** | Time difference between Auth0 and Ory | Auth0 uses UTC; ensure no custom `NotBefore`/`NotOnOrAfter` overrides cause issues. Ory allows a default skew tolerance of 60 seconds. |
| **User not created after SSO** | Missing required attributes | Verify that `email` is included in the SAML assertion and mapped correctly |
| **"No SSO connection found"** | Email domain not mapped | Verify the domain is associated with the organization via `ory list organizations` |
| **Redirect loop** | ACS URL misconfigured | Confirm the Callback URL in Auth0 matches `https://{slug}.projects.oryapis.com/saml/acs` exactly |
| **NameID missing** | Auth0 nameIdentifierProbes misconfigured | Ensure `nameIdentifierProbes` includes the email claim URI |

## Resources

- [Ory Polis Auth0 SSO Documentation](https://www.ory.sh/docs/polis/sso-providers/auth0)
- [Ory Polis SSO Overview](https://www.ory.sh/docs/polis/sso)
- [Auth0 SAML Configuration](https://auth0.com/docs/authenticate/protocols/saml/saml-configuration)
- [Auth0 SAML2 Web App Addon](https://auth0.com/docs/authenticate/protocols/saml/saml-sso-integrations)
- [Ory CLI Reference](https://www.ory.sh/docs/cli)
- [SAML 2.0 Specification](http://docs.oasis-open.org/security/saml/v2.0/)
