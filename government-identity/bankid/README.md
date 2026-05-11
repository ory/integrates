# BankID Integration with Ory Network

## Overview

BankID is a high-assurance electronic identification system used in Sweden and Norway for online authentication and digital signing. It is issued by banks and provides a government-recognized identity verification level suitable for financial services, healthcare, and public sector applications. Integrating BankID with Ory Network requires a licensed broker intermediary (such as Signicat, Nets/Netigate, or BankID directly) since direct BankID API access is restricted to licensed service providers.

Key integration capabilities:
- High-assurance identity verification for fintech and regulated industries
- BankID authentication via licensed broker (Signicat, Nets, Criipto, etc.)
- Identity data (personal number, name) stored in Ory identity after verification
- Supports both Swedish BankID and Norwegian BankID
- Compatible with PSD2 Strong Customer Authentication (SCA) requirements

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │    │              │
│   User       │─1─▶│  Ory Kratos  │─2─▶│  Broker      │─3─▶│  BankID      │
│   Browser    │    │  Login/Reg   │    │  (Signicat/  │    │  Service     │
│              │    │              │    │   Criipto)   │    │              │
│              │◀─6─│              │◀─5─│              │◀─4─│              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘

Flow:
1. User initiates login/registration, selects BankID
2. Ory Kratos redirects to broker's OIDC endpoint
3. Broker initiates BankID authentication
4. User authenticates with BankID app (mobile) or security device
5. Broker returns OIDC tokens with verified identity claims to Ory
6. Ory creates/updates identity with verified data, redirects user to app
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Configures broker as OIDC social sign-in provider. Stores verified identity data. |
| **Ory Network OIDC** | Broker integration via standard OIDC protocol. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **Broker Account**: A licensed BankID broker such as:
  - [Signicat](https://www.signicat.com/) — Nordic eID broker
  - [Criipto](https://www.criipto.com/) — Nordic eID as OIDC
  - [Nets](https://www.nets.eu/) — Payment and eID services
  - [BankID Norge AS](https://www.bankid.no/) — Norwegian BankID directly (requires license)
- **Broker OIDC Credentials**: Client ID and secret from the broker
- **Qualified Agreement**: Contractual agreement with the broker for BankID usage

## Configuration

### Step 1: Set Up Broker Account

Using Criipto as an example (they expose BankID directly as OIDC):

1. Sign up at [Criipto](https://dashboard.criipto.com/)
2. Create a new application
3. Configure the callback URL: `https://<your-ory-project>.projects.oryapis.com/self-service/methods/oidc/callback/bankid`
4. Enable Swedish BankID and/or Norwegian BankID
5. Note the **Client ID**, **Client Secret**, and **OIDC Discovery URL**

Criipto OIDC Discovery URL (example):
```
https://YOUR_DOMAIN.criipto.id/.well-known/openid-configuration
```

### Step 2: Configure Ory OIDC Provider

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/methods/oidc/enabled=true' \
  --add '/selfservice/methods/oidc/config/providers/0/id="bankid"' \
  --add '/selfservice/methods/oidc/config/providers/0/provider="generic"' \
  --add '/selfservice/methods/oidc/config/providers/0/client_id="<broker-client-id>"' \
  --add '/selfservice/methods/oidc/config/providers/0/client_secret="<broker-client-secret>"' \
  --add '/selfservice/methods/oidc/config/providers/0/issuer_url="https://YOUR_DOMAIN.criipto.id"' \
  --add '/selfservice/methods/oidc/config/providers/0/label="BankID"' \
  --add '/selfservice/methods/oidc/config/providers/0/scope=["openid","profile","ssn"]' \
  --add '/selfservice/methods/oidc/config/providers/0/mapper_url="file:///etc/config/kratos/bankid-mapper.jsonnet"'
```

### Step 3: Create Identity Mapper

**`bankid-mapper.jsonnet`:**

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      email: if std.objectHas(claims, 'email') then claims.email else null,
      name: {
        first: if std.objectHas(claims, 'given_name') then claims.given_name
               else if std.objectHas(claims, 'name') then std.split(claims.name, ' ')[0]
               else null,
        last: if std.objectHas(claims, 'family_name') then claims.family_name
              else if std.objectHas(claims, 'name') then std.split(claims.name, ' ')[std.length(std.split(claims.name, ' ')) - 1]
              else null,
      },
    },
    metadata_public: {
      bankid: {
        verified: true,
        // Swedish personal number (personnummer) or Norwegian national ID
        personal_number: if std.objectHas(claims, 'ssn') then claims.ssn
                        else if std.objectHas(claims, 'socialno') then claims.socialno
                        else null,
        country: if std.objectHas(claims, 'country') then claims.country
                else if std.objectHas(claims, 'identityscheme') then
                  if std.startsWith(claims.identityscheme, 'sebankid') then 'SE'
                  else if std.startsWith(claims.identityscheme, 'nobankid') then 'NO'
                  else null
                else null,
        identity_scheme: if std.objectHas(claims, 'identityscheme') then claims.identityscheme else null,
        verified_at: std.extVar('claims').iat,
        assurance_level: 'high',
      },
    },
  },
}
```

### Step 4: Configure Identity Schema

Ensure your identity schema accommodates BankID-verified fields:

```json
{
  "$id": "https://example.com/identity.schema.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "User",
  "type": "object",
  "properties": {
    "traits": {
      "type": "object",
      "properties": {
        "email": {
          "type": "string",
          "format": "email",
          "ory.sh/kratos": {
            "credentials": { "password": { "identifier": true } },
            "verification": { "via": "email" }
          }
        },
        "name": {
          "type": "object",
          "properties": {
            "first": { "type": "string" },
            "last": { "type": "string" }
          }
        }
      },
      "required": ["email"]
    }
  }
}
```

## Architecture with Broker Intermediary

```
┌────────────┐     ┌──────────┐     ┌──────────────┐     ┌──────────────┐
│            │     │          │     │              │     │              │
│  End User  │     │  Ory     │     │   Broker     │     │  BankID      │
│  (Browser  │     │  Network │     │  (Criipto/   │     │  Infrastructure│
│   + BankID │     │          │     │   Signicat)  │     │  (SE/NO)     │
│   App)     │     │          │     │              │     │              │
└─────┬──────┘     └────┬─────┘     └──────┬───────┘     └──────┬───────┘
      │                 │                   │                    │
      │──Login click──▶│                   │                    │
      │                 │──OIDC AuthZ──────▶│                    │
      │                 │                   │──BankID request───▶│
      │◀──────────────────Open BankID app───────────────────────│
      │──Sign in app──▶│                   │                    │
      │                 │                   │◀──Signed response──│
      │                 │◀──OIDC callback───│                    │
      │                 │  (ID token with   │                    │
      │                 │   verified claims)│                    │
      │◀──Session──────│                   │                    │
```

## BankID Assurance Levels

| BankID Type | Country | Assurance Level | Use Cases |
|------------|---------|-----------------|-----------|
| Swedish BankID | SE | High (eIDAS Substantial/High) | Banking, government services, healthcare |
| Norwegian BankID | NO | High (eIDAS Substantial) | Banking, government services |
| Norwegian BankID on Mobile | NO | Substantial | Lower-friction authentication |

## Testing

### 1. Test Authentication Flow

1. Navigate to your application's login page
2. Click "Sign in with BankID"
3. Complete BankID authentication via the mobile app or security device
4. Verify redirect back to your application with an active session

### 2. Verify Identity Data

```bash
ory get identity <identity-id> --project <project-id> --format json | \
  jq '{traits: .traits, bankid: .metadata_public.bankid}'
```

### 3. Test with Broker Test Environment

Most brokers provide test environments with simulated BankID:
- **Criipto**: Test users available in sandbox mode
- **Signicat**: Preprod environment with test personal numbers

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **OIDC callback error** | Callback URL mismatch | Verify callback URL matches exactly in broker config |
| **Missing personal number** | Scope not requested | Ensure `ssn` scope is included in OIDC request |
| **BankID app not opening** | Test vs. production environment | Use broker's test environment for development |
| **Identity not created** | Mapper error | Check Jsonnet mapper handles all claim variations |
| **Certificate errors** | Broker cert rotation | Update broker OIDC discovery URL or metadata |

## Compliance Notes

- BankID authentication satisfies PSD2 Strong Customer Authentication (SCA)
- Swedish BankID maps to eIDAS assurance level Substantial or High
- Personal numbers (personnummer) are sensitive PII; store in `metadata_admin` for restricted access if needed
- Broker agreements typically include data processing terms; review with legal

## Resources

- [Criipto BankID Integration](https://docs.criipto.com/verify/e-ids/swedish-bankid/)
- [Signicat BankID](https://developer.signicat.com/docs/authentication/bankid-se/)
- [Swedish BankID Technical Documentation](https://www.bankid.com/en/utvecklare/guider)
- [Norwegian BankID](https://www.bankid.no/en/)
- [Ory OIDC Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/generic)
- [eIDAS Assurance Levels](https://ec.europa.eu/digital-building-blocks/wikis/display/DIGITAL/eIDAS+Levels+of+Assurance)
