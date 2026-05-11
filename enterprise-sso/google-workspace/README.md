# Google Workspace SAML SSO Integration with Ory Network

## Overview

Google Workspace (formerly G Suite) is Google's suite of cloud-based productivity and collaboration tools used by millions of organizations worldwide. As a SAML Identity Provider, Google Workspace enables enterprises to use their existing Google identities for single sign-on into applications protected by Ory Network. This is one of the most common enterprise SSO integrations, as organizations already manage user accounts through Google Workspace's Admin Console.

Google Workspace supports:
- SAML 2.0 SP-initiated SSO
- Custom SAML app configuration via the Admin Console
- Organizational unit-based access control
- Google's built-in MFA (2-Step Verification) enforcement

## Integration Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Application   │────1───▶│   Ory Polis     │────2───▶│ Google Workspace│
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
2. Ory Polis generates SAML AuthnRequest, redirects to Google
3. User authenticates with Google credentials (+ 2FA if enabled),
   Google returns SAML Response with assertion
4. Ory Polis validates assertion, creates/updates Ory Kratos identity
5. User redirected back to application with active session
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Polis** | SAML Service Provider. Manages the SSO connection to Google Workspace and enforces organization-level authentication policies. |
| **Ory Kratos** | Identity management. Stores identities provisioned from Google SAML assertions. Maps Google attributes to identity traits. |
| **Ory Hydra** | OAuth2/OIDC token issuance for downstream applications after SSO authentication. |

## Prerequisites

- **Google Workspace Admin Access**: Super Admin or delegated admin with rights to manage SAML apps
- **Google Workspace Edition**: Business Starter, Business Standard, Business Plus, Enterprise, or Education (SAML SSO is not available on the free legacy tier)
- **Ory Network Account**: Active Ory Network project with Polis enabled
- **Verified Domain**: Your organization's email domain verified in Ory Network
- **Google Workspace Domain**: The same domain managed in Google Workspace Admin Console

## Configuration

### Step 1: Obtain Ory Polis SP Metadata

Retrieve SP metadata from Ory:

```
https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata
```

Note these values for Google Workspace configuration:
- **ACS URL**: `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs`
- **Entity ID**: `https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata`

### Step 2: Create a Custom SAML App in Google Workspace

1. Sign in to [Google Admin Console](https://admin.google.com/)
2. Navigate to **Apps > Web and mobile apps**
3. Click **Add app > Add custom SAML app**
4. Enter an **App name** (e.g., "Ory Network SSO") and optional description
5. Click **Continue**

### Step 3: Download Google IdP Metadata

On the **Google Identity Provider details** page:
1. Click **Download Metadata** to get the IdP metadata XML file
2. Note the following values:
   - **SSO URL**: `https://accounts.google.com/o/saml2/idp?idpid=<google-idp-id>`
   - **Entity ID**: `https://accounts.google.com/o/saml2?idpid=<google-idp-id>`
3. Download the **Certificate** (X.509 PEM format)
4. Click **Continue**

### Step 4: Configure Service Provider Details in Google

Enter the following in the **Service provider details** page:

| Field | Value |
|-------|-------|
| **ACS URL** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs` |
| **Entity ID** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata` |
| **Start URL** | (leave empty or set to your application login URL) |
| **Signed response** | Checked |
| **Name ID** | Basic Information > Primary email |
| **Name ID Format** | EMAIL |

Click **Continue**.

### Step 5: Configure Attribute Mapping in Google

Add the following attribute mappings:

| Google Directory Attribute | App Attribute |
|---------------------------|---------------|
| Primary email | `email` |
| First name | `firstName` |
| Last name | `lastName` |
| Department | `department` |

Click **Finish**.

### Step 6: Enable the SAML App

1. On the app details page, click **User access**
2. Select **ON for everyone** or choose specific organizational units
3. Click **Save**

Note: It may take up to 24 hours for changes to propagate across Google Workspace.

### Step 7: Configure Ory Polis SSO Connection

Using the Ory CLI:

```bash
# Create SSO connection with Google IdP metadata
ory create sso-connection \
  --project <project-id> \
  --provider saml \
  --label "Google Workspace SSO" \
  --idp-metadata-file ./google-idp-metadata.xml \
  --organization-id <org-id>

# Map the email domain
ory update organization \
  --project <project-id> \
  --id <org-id> \
  --domains "yourdomain.com"
```

Or via the Ory Console:
1. Go to **Authentication > Enterprise SSO**
2. Click **Add SSO Connection**
3. Select **SAML**
4. Upload the Google IdP metadata XML or paste the metadata URL
5. Associate the connection with your organization
6. Save

## Technical Details

### SAML Attribute Mapping

| Google Workspace Attribute | SAML Attribute Name | Ory Identity Trait |
|---------------------------|--------------------|--------------------|
| Primary email | `email` | `traits.email` |
| First name | `firstName` | `traits.name.first` |
| Last name | `lastName` | `traits.name.last` |
| Department | `department` | `metadata_public.department` |
| Phone number | `phone` | `traits.phone` |

### SAML Assertion Details

- **NameID Format**: `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`
- **NameID Value**: User's primary email address
- **Binding**: HTTP-POST for ACS, HTTP-Redirect for AuthnRequest
- **Signature Algorithm**: RSA-SHA256
- **Response Signed**: Yes
- **Assertion Signed**: Yes
- **Certificate**: Google-managed, auto-rotated

### Sample Google IdP Metadata Snippet

```xml
<EntityDescriptor entityID="https://accounts.google.com/o/saml2?idpid=GOOGLE_IDP_ID"
  xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>
            <!-- Google signing certificate (Base64 encoded) -->
          </X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://accounts.google.com/o/saml2/idp?idpid=GOOGLE_IDP_ID"/>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="https://accounts.google.com/o/saml2/idp?idpid=GOOGLE_IDP_ID"/>
  </IDPSSODescriptor>
</EntityDescriptor>
```

## Testing

### 1. Verify Metadata Exchange

```bash
# Verify Ory SP metadata is accessible
curl -s https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata | xmllint --format -
```

### 2. Test SP-Initiated SSO

1. Open your application login page
2. Enter an email address from your Google Workspace domain
3. You should be redirected to Google's login page
4. Sign in with Google Workspace credentials
5. Complete 2-Step Verification if enabled
6. Verify you are redirected back to your application with an active session

### 3. Verify Identity in Ory

```bash
ory list identities --project <project-id> --format json | \
  jq '.[] | select(.traits.email == "user@yourdomain.com")'
```

### 4. Test with Google Admin Console

In the Google Admin Console under **Apps > Web and mobile apps > [Your SAML App]**:
1. Click **TEST SAML LOGIN** to initiate IdP-initiated flow
2. Verify the SAML response is sent to Ory's ACS URL

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **"App is not configured"** in Google | SAML app not enabled for user's OU | Enable the app for the correct organizational unit in Google Admin |
| **403 Forbidden from Google** | User not assigned to the SAML app | Verify the app is enabled for the user's organizational unit |
| **Invalid SAML response** | Entity ID mismatch | Ensure Entity ID in Google matches Ory's SP Entity ID exactly |
| **Certificate error** | Google rotated its signing certificate | Download the new certificate from Google Admin and update the SSO connection in Ory |
| **Attributes not mapped** | Attribute names mismatch | Verify attribute names in Google Admin match what Ory expects |
| **Propagation delay** | Google Workspace change propagation | Wait up to 24 hours after enabling the SAML app or modifying settings |
| **Clock skew** | Time drift between Google and assertion validation | Google uses NTP; issue is rare. Check `NotBefore`/`NotOnOrAfter` in the assertion. |
| **Users in wrong OU** | SAML app scoped to specific OU | Move users to the correct OU or enable the app for all OUs |

## Resources

- [Ory Polis Google Workspace SSO Documentation](https://www.ory.sh/docs/polis/sso-providers/google)
- [Ory Polis SSO Overview](https://www.ory.sh/docs/polis/sso)
- [Google Workspace SAML App Setup](https://support.google.com/a/answer/6087519)
- [Google Admin Console](https://admin.google.com/)
- [Google Workspace SAML Reference](https://support.google.com/a/answer/6363825)
- [Ory CLI Reference](https://www.ory.sh/docs/cli)
- [SAML 2.0 Specification](http://docs.oasis-open.org/security/saml/v2.0/)
