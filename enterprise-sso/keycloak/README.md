# Keycloak SSO Integration with Ory Network

## Overview

Keycloak is an open-source identity and access management solution maintained by Red Hat. It provides SAML 2.0, OpenID Connect, and OAuth 2.0 federation capabilities, making it a popular choice for enterprises that need a self-hosted or hybrid identity provider. Keycloak is widely deployed in organizations that require full control over their identity infrastructure, need to comply with data residency requirements, or want to avoid vendor lock-in.

This integration configures Keycloak as either a SAML 2.0 or OIDC Identity Provider federating with Ory Network. Unlike most integrations in this directory that use Ory Polis, Keycloak can integrate with either Ory Polis (for managed SSO) or directly with Ory Kratos/Hydra (for self-hosted or hybrid scenarios).

Key Keycloak capabilities:
- SAML 2.0 and OIDC/OAuth 2.0 provider
- User federation (LDAP, Active Directory, custom)
- Identity brokering (chain multiple IdPs)
- Fine-grained authorization policies
- Custom authentication flows (SPI extensions)
- Multi-tenancy via realms
- Open-source with Red Hat SSO commercial support option

## Integration Architecture

### Option A: Keycloak with Ory Polis (Managed SSO)

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Application   │────1───▶│   Ory Polis     │────2───▶│   Keycloak      │
│   (Your App)    │         │(SAML SP/OIDC RP)│         │ (SAML IdP /     │
│                 │◀───5────│                 │◀───3────│  OIDC OP)       │
│                 │         │                 │         │                 │
└─────────────────┘         └────────┬────────┘         └────────┬────────┘
                                     │                           │
                                     4                    ┌──────▼──────┐
                                     │                    │  LDAP / AD  │
                            ┌────────▼────────┐           │  User       │
                            │  Ory Kratos     │           │  Federation │
                            │  (Identity)     │           └─────────────┘
                            └─────────────────┘
```

### Option B: Keycloak with Ory Kratos (Social/OIDC Connection)

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Application   │────1───▶│   Ory Kratos    │────2───▶│   Keycloak      │
│   (Your App)    │         │  (OIDC Client)  │         │   (OIDC OP)     │
│                 │◀───4────│                 │◀───3────│                 │
│                 │         │                 │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘

Flow:
1. User starts login flow in Kratos
2. Kratos redirects to Keycloak as an OIDC provider
3. User authenticates at Keycloak, tokens returned
4. Kratos creates/links identity, user redirected to app
```

### Option C: Keycloak with Ory Hydra (OAuth2 Federation)

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Third-party   │────1───▶│   Ory Hydra     │────2───▶│   Keycloak      │
│   Application   │         │  (OAuth2/OIDC   │         │   (Identity     │
│                 │◀───4────│   Provider)     │◀───3────│    Backend)     │
│                 │         │                 │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘

Flow:
1. Third-party app initiates OAuth2 flow with Hydra
2. Hydra delegates user authentication to Keycloak
3. Keycloak authenticates user, returns to Hydra login endpoint
4. Hydra issues OAuth2/OIDC tokens to the third-party app
```

## Ory Products

| Product | Role | Integration Type |
|---------|------|-----------------|
| **Ory Polis** | SAML SP / OIDC RP for managed SSO | Option A |
| **Ory Kratos** | Identity management with OIDC social sign-in | Option B |
| **Ory Hydra** | OAuth2/OIDC provider delegating auth to Keycloak | Option C |

## Prerequisites

- **Keycloak Instance**: Running Keycloak 18+ (Quarkus distribution) or legacy WildFly distribution
- **Keycloak Admin Access**: Realm admin privileges
- **Network Access**: Keycloak must be accessible from the internet (for Ory Network) or via private networking
- **Ory Network Account**: Active project (for Options A/B with Ory Network)
- **TLS Certificate**: Valid HTTPS on Keycloak endpoint
- **Keycloak Realm**: A configured realm for your organization

## Configuration

### Option A: SAML Integration with Ory Polis

#### Step 1: Obtain Ory SP Metadata

```
https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata
```

#### Step 2: Create a SAML Client in Keycloak

1. Log in to Keycloak Admin Console (`https://keycloak.yourdomain.com/admin`)
2. Select your **Realm**
3. Navigate to **Clients > Create client**
4. Set **Client type** to **SAML**
5. Set **Client ID** to Ory's Entity ID:
   ```
   https://{your-ory-project-slug}.projects.oryapis.com/saml/metadata
   ```
6. Click **Next** and **Save**

#### Step 3: Configure SAML Client Settings

| Setting | Value |
|---------|-------|
| **Root URL** | `https://{your-ory-project-slug}.projects.oryapis.com` |
| **Valid Redirect URIs** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs` |
| **Master SAML Processing URL** | `https://{your-ory-project-slug}.projects.oryapis.com/saml/acs` |
| **Name ID Format** | email |
| **Force Name ID Format** | ON |
| **Sign Documents** | ON |
| **Sign Assertions** | ON |
| **Signature Algorithm** | RSA_SHA256 |
| **Canonicalization Method** | EXCLUSIVE |

#### Step 4: Configure SAML Protocol Mappers

Add the following protocol mappers under **Client Scopes > [client]-dedicated > Add mapper**:

| Mapper Type | Name | User Attribute | SAML Attribute Name |
|------------|------|----------------|-------------------|
| User Attribute | email | email | `email` |
| User Attribute | firstName | firstName | `firstName` |
| User Attribute | lastName | lastName | `lastName` |
| User Attribute | username | username | `username` |
| Group list | groups | (n/a) | `groups` |

#### Step 5: Download Keycloak SAML Metadata

Keycloak SAML IdP metadata URL:
```
https://keycloak.yourdomain.com/realms/{realm-name}/protocol/saml/descriptor
```

#### Step 6: Configure Ory Polis

```bash
ory create sso-connection \
  --project <project-id> \
  --provider saml \
  --label "Keycloak SAML SSO" \
  --idp-metadata-url "https://keycloak.yourdomain.com/realms/{realm}/protocol/saml/descriptor" \
  --organization-id <org-id>
```

---

### Option B: OIDC Integration with Ory Kratos

#### Step 1: Create an OIDC Client in Keycloak

1. In Keycloak Admin Console, go to **Clients > Create client**
2. Set **Client type** to **OpenID Connect**
3. Set **Client ID** (e.g., `ory-kratos`)
4. Enable **Client authentication** (for confidential client)
5. Set **Valid redirect URIs**:
   ```
   https://{your-ory-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/keycloak
   ```

#### Step 2: Note Client Credentials

From the **Credentials** tab:
- **Client ID**: `ory-kratos`
- **Client Secret**: (copy the generated secret)

#### Step 3: Keycloak OIDC Discovery URL

```
https://keycloak.yourdomain.com/realms/{realm-name}/.well-known/openid-configuration
```

#### Step 4: Configure Ory Kratos OIDC Provider

In your Ory identity schema or via CLI:

```bash
ory create sso-connection \
  --project <project-id> \
  --provider oidc \
  --label "Keycloak OIDC" \
  --issuer-url "https://keycloak.yourdomain.com/realms/{realm}" \
  --client-id "ory-kratos" \
  --client-secret "<client-secret>" \
  --scopes "openid,profile,email" \
  --organization-id <org-id>
```

Or configure via the Kratos OIDC configuration:

```yaml
selfservice:
  methods:
    oidc:
      enabled: true
      config:
        providers:
          - id: keycloak
            provider: generic
            client_id: ory-kratos
            client_secret: <client-secret>
            issuer_url: https://keycloak.yourdomain.com/realms/{realm}
            mapper_url: base64://...
            scope:
              - openid
              - profile
              - email
```

---

### Map Email Domain (Both Options)

```bash
ory update organization \
  --project <project-id> \
  --id <org-id> \
  --domains "yourdomain.com"
```

## Technical Details

### SAML Attribute Mapping

| Keycloak User Attribute | SAML Attribute Name | Ory Identity Trait |
|------------------------|--------------------|--------------------|
| `email` | `email` | `traits.email` |
| `firstName` | `firstName` | `traits.name.first` |
| `lastName` | `lastName` | `traits.name.last` |
| `username` | `username` | `metadata_public.keycloak_username` |
| Groups | `groups` | `metadata_public.groups` |
| Realm Roles | `roles` | `metadata_public.roles` |

### OIDC Claim Mapping

| Keycloak OIDC Claim | Ory Identity Trait |
|--------------------|-------------------|
| `sub` | `metadata_public.keycloak_sub` |
| `email` | `traits.email` |
| `email_verified` | (verification status) |
| `given_name` | `traits.name.first` |
| `family_name` | `traits.name.last` |
| `preferred_username` | `metadata_public.username` |
| `realm_access.roles` | `metadata_public.roles` |
| `groups` | `metadata_public.groups` |

### SAML Assertion Details

- **NameID Format**: `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress`
- **Signature Algorithm**: RSA-SHA256
- **Assertion Signed**: Yes
- **Response Signed**: Yes
- **Issuer**: `https://keycloak.yourdomain.com/realms/{realm}`

### OIDC Details

- **Discovery URL**: `https://keycloak.yourdomain.com/realms/{realm}/.well-known/openid-configuration`
- **Authorization Endpoint**: `https://keycloak.yourdomain.com/realms/{realm}/protocol/openid-connect/auth`
- **Token Endpoint**: `https://keycloak.yourdomain.com/realms/{realm}/protocol/openid-connect/token`
- **UserInfo Endpoint**: `https://keycloak.yourdomain.com/realms/{realm}/protocol/openid-connect/userinfo`
- **JWKS URI**: `https://keycloak.yourdomain.com/realms/{realm}/protocol/openid-connect/certs`
- **Supported Scopes**: `openid`, `profile`, `email`, `address`, `phone`, `roles`, `web-origins`
- **ID Token Signing**: RS256

### Sample Keycloak SAML Metadata Snippet

```xml
<EntityDescriptor entityID="https://keycloak.yourdomain.com/realms/{realm}"
  xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>
            <!-- Keycloak realm signing certificate (Base64 encoded) -->
          </X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <SingleLogoutService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://keycloak.yourdomain.com/realms/{realm}/protocol/saml"/>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="https://keycloak.yourdomain.com/realms/{realm}/protocol/saml"/>
    <SingleSignOnService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="https://keycloak.yourdomain.com/realms/{realm}/protocol/saml"/>
  </IDPSSODescriptor>
</EntityDescriptor>
```

## Testing

### 1. Verify Metadata / Discovery

```bash
# SAML metadata
curl -s "https://keycloak.yourdomain.com/realms/{realm}/protocol/saml/descriptor" | xmllint --format -

# OIDC discovery
curl -s "https://keycloak.yourdomain.com/realms/{realm}/.well-known/openid-configuration" | jq .
```

### 2. Test SP-Initiated SSO

1. Navigate to your application login page
2. Enter an email from your Keycloak-managed domain
3. Authenticate at Keycloak
4. Verify redirect with active session

### 3. Verify Identity

```bash
ory list identities --project <project-id> --format json | \
  jq '.[] | select(.traits.email == "user@yourdomain.com")'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Invalid redirect URI** | Redirect URI not registered in Keycloak client | Add the exact URI in Keycloak client's Valid Redirect URIs |
| **Client not found** | Wrong client ID | Verify client ID matches in both Keycloak and Ory configuration |
| **Certificate error** | Keycloak realm key rotated | Re-download SAML metadata or update OIDC JWKS |
| **NameID missing** | Email not set on Keycloak user | Ensure users have email attribute populated |
| **CORS errors** | Keycloak Web Origins not configured | Add Ory domain to Web Origins in Keycloak client settings |
| **Groups/roles not in token** | Mappers not configured | Add group/role protocol mappers to the client scope |
| **Clock skew** | Keycloak server time drift | Sync Keycloak server to NTP |
| **OIDC: invalid_client_secret** | Secret rotated | Regenerate client secret in Keycloak and update Ory |
| **Keycloak unreachable** | Network/firewall issue | Ensure Keycloak is accessible from Ory Network (public internet or private link) |

## Resources

- [Ory Polis SSO Overview](https://www.ory.sh/docs/polis/sso)
- [Ory Kratos OIDC Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/overview)
- [Keycloak SAML Client Documentation](https://www.keycloak.org/docs/latest/server_admin/#_client-saml-configuration)
- [Keycloak OIDC Client Documentation](https://www.keycloak.org/docs/latest/server_admin/#_oidc_clients)
- [Keycloak Protocol Mappers](https://www.keycloak.org/docs/latest/server_admin/#_protocol-mappers)
- [Keycloak Admin Console](https://www.keycloak.org/docs/latest/server_admin/)
- [Ory CLI Reference](https://www.ory.sh/docs/cli)
