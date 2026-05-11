# NetID Social Sign-In - Ory Network Integration

## Overview

NetID is a European single sign-on standard backed by the European netID Foundation. It provides a privacy-focused, GDPR-compliant identity solution primarily used in Germany and Europe. NetID partners include major media companies, e-commerce platforms, and telecom providers. Integrating NetID with Ory Network enables European applications to offer a trusted, privacy-respecting authentication option.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "netid" provider)
       |
       v
  NetID Authorization Endpoint
  (https://broker.netid.de/authorize)
       |
       v
  NetID Login & Consent
       |
       v
  NetID Token Endpoint
  (https://broker.netid.de/token)
       |
       v
  NetID Userinfo Endpoint
  (https://broker.netid.de/userinfo)
       |
       v
  Ory Kratos creates/updates identity
       |
       v
  User redirected to application
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management, OIDC provider support |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **NetID Partner Account** — Register as a partner at [netid.de](https://netid.de/) or [developer.netid.de](https://developer.netid.de/).
3. **NetID Client Registration** — Obtain OAuth2 credentials:
   - Note the **Client ID** and **Client Secret**.
   - Register your **Redirect URI**:
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/netid
     ```

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `netid-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'given_name' in claims then 'first' else null]: claims.given_name,
           [if 'family_name' in claims then 'last' else null]: claims.family_name,
         },
       },
     },
   }
   ```

2. **Add NetID as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "netid",
       "provider": "netid",
       "client_id": "<your-netid-client-id>",
       "client_secret": "<your-netid-client-secret>",
       "scope": ["openid", "email", "profile"],
       "mapper_url": "base64://'"$(base64 < netid-mapper.jsonnet)"'"
     }'
   ```

3. **Enable the OIDC method:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/enabled=true'
   ```

## Technical Details

### OIDC Configuration

| Parameter | Value |
|-----------|-------|
| Provider Type | `netid` (native support) |
| Issuer URL | `https://broker.netid.de/` |
| Authorization URL | `https://broker.netid.de/authorize` |
| Token URL | `https://broker.netid.de/token` |
| Userinfo URL | `https://broker.netid.de/userinfo` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `openid` | OIDC ID token |
| `email` | Email address |
| `profile` | Name information |

### Claims from NetID

| Claim | Description |
|-------|-------------|
| `sub` | Unique user identifier |
| `email` | Email address |
| `email_verified` | Whether email is verified |
| `given_name` | First name |
| `family_name` | Last name |
| `birthdate` | Date of birth |
| `gender` | Gender |
| `address` | Postal address |

## Example Identity Schema

### Jsonnet Claims Mapper (`netid-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'given_name' in claims then 'first' else null]: claims.given_name,
        [if 'family_name' in claims then 'last' else null]: claims.family_name,
      },
    },
  },
}
```

## Testing

1. **Start a login flow** and authenticate with a NetID account.
2. **Verify identity creation** with email and name.
3. **Test GDPR consent flows** — NetID provides granular consent management.

```bash
ory list identities --project <your-project-id> --workspace <your-workspace-id>
```

## Resources

- [Ory Kratos NetID Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/netid)
- [NetID Developer Documentation](https://developer.netid.de/)
- [NetID Foundation](https://netid.de/)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
