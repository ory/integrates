# iDIN Integration with Ory Network

## Overview

iDIN is a Dutch identity verification service operated by the Dutch banking sector that allows individuals to identify themselves online using their bank credentials. It provides verified identity attributes (name, address, date of birth) backed by KYC data that banks have already collected. iDIN is widely used in the Netherlands for age verification, onboarding, and regulatory compliance.

Key integration capabilities:
- Bank-verified identity for Dutch market applications
- Verified name, address, date of birth, and 18+ age verification
- Integration via iDIN-licensed service providers (Signicat, CM.com, Connective)
- OIDC-based integration with Ory Network
- Suitable for KYC, age verification, and onboarding flows

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │    │              │
│   Dutch User │─1─▶│  Ory Kratos  │─2─▶│  iDIN Broker │─3─▶│  User's Bank │
│   Browser    │    │  (OIDC)      │    │  (Signicat/  │    │  (ING/Rabo/  │
│              │    │              │    │   CM.com)    │    │   ABN AMRO)  │
│              │◀─6─│              │◀─5─│              │◀─4─│              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘

Flow:
1. User initiates identity verification, selects iDIN
2. Ory redirects to broker's OIDC endpoint for iDIN
3. Broker presents bank selection; user chooses their bank
4. User authenticates with their bank (bank app, card reader, etc.)
5. Broker returns verified identity attributes via OIDC tokens
6. Ory creates/updates identity with bank-verified data
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Configures iDIN broker as OIDC provider. Stores verified identity data. |
| **Ory Network OIDC** | Standard OIDC integration with iDIN broker. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **iDIN Broker Account**: Licensed iDIN intermediary:
  - [Signicat](https://www.signicat.com/) — Pan-European eID and iDIN broker
  - [CM.com](https://www.cm.com/) — Dutch identity verification
  - [Connective](https://connective.eu/) — Digital identity solutions
- **Broker OIDC Credentials**: Client ID and secret
- **Dutch Market Application**: iDIN is designed for services targeting Dutch consumers

## Configuration

### Step 1: Set Up iDIN via Broker

Using Signicat as an example:

1. Sign up at [Signicat Dashboard](https://dashboard.signicat.com/)
2. Enable iDIN as an identity method
3. Create an OIDC application
4. Configure callback URL: `https://<your-ory-project>.projects.oryapis.com/self-service/methods/oidc/callback/idin`
5. Note **Client ID**, **Client Secret**, and **OIDC Discovery URL**

### Step 2: Configure Ory OIDC Provider

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/methods/oidc/enabled=true' \
  --add '/selfservice/methods/oidc/config/providers/0/id="idin"' \
  --add '/selfservice/methods/oidc/config/providers/0/provider="generic"' \
  --add '/selfservice/methods/oidc/config/providers/0/client_id="<broker-client-id>"' \
  --add '/selfservice/methods/oidc/config/providers/0/client_secret="<broker-client-secret>"' \
  --add '/selfservice/methods/oidc/config/providers/0/issuer_url="https://your-broker.com"' \
  --add '/selfservice/methods/oidc/config/providers/0/label="iDIN (Dutch Bank ID)"' \
  --add '/selfservice/methods/oidc/config/providers/0/scope=["openid","profile","address","birthdate"]' \
  --add '/selfservice/methods/oidc/config/providers/0/mapper_url="file:///etc/config/kratos/idin-mapper.jsonnet"'
```

### Step 3: Create Identity Mapper

**`idin-mapper.jsonnet`:**

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      email: if std.objectHas(claims, 'email') then claims.email else null,
      name: {
        first: if std.objectHas(claims, 'given_name') then claims.given_name
               else if std.objectHas(claims, 'initials') then claims.initials
               else null,
        last: if std.objectHas(claims, 'family_name') then claims.family_name else null,
      },
    },
    metadata_public: {
      idin: {
        verified: true,
        date_of_birth: if std.objectHas(claims, 'birthdate') then claims.birthdate else null,
        age_18_or_over: if std.objectHas(claims, 'age_18_or_over') then claims.age_18_or_over
                       else if std.objectHas(claims, 'birthdate') then true
                       else null,
        address: if std.objectHas(claims, 'address') then {
          street: claims.address.street_address,
          city: claims.address.locality,
          postal_code: claims.address.postal_code,
          country: claims.address.country,
        } else null,
        bin: if std.objectHas(claims, 'sub') then claims.sub else null,
        issuing_bank: if std.objectHas(claims, 'iss') then claims.iss else null,
        verified_at: if std.objectHas(claims, 'iat') then claims.iat else null,
        country: 'NL',
      },
    },
  },
}
```

## iDIN Attributes

| Attribute | Description | Always Returned |
|-----------|-------------|-----------------|
| **BIN (Bank Identifier Number)** | Pseudonymized unique identifier per bank | Yes |
| **Name (initials + surname)** | Legal name from bank records | Yes |
| **Date of birth** | Full date of birth | Yes |
| **18+ indicator** | Boolean age verification | Yes |
| **Address** | Registered address (street, city, postal code) | Depending on scope |
| **Gender** | As registered with the bank | Optional |

## Participating Banks

- ABN AMRO
- ING
- Rabobank
- SNS
- ASN Bank
- RegioBank
- Triodos Bank
- Van Lanschot
- Knab
- Bunq

## Testing

### 1. Test with Broker Sandbox

Brokers provide test environments with simulated bank flows:

```bash
# Verify OIDC discovery
curl -s https://your-broker.com/.well-known/openid-configuration | jq '.authorization_endpoint'
```

### 2. Test iDIN Flow

1. Navigate to your application
2. Select "iDIN (Dutch Bank ID)"
3. Choose a test bank in the sandbox
4. Complete simulated bank authentication
5. Verify identity created in Ory

### 3. Verify Identity Data

```bash
ory get identity <identity-id> --project <project-id> --format json | \
  jq '.metadata_public.idin'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Bank list not loading** | Broker configuration | Verify iDIN is enabled in broker dashboard |
| **Missing date of birth** | Scope not requested | Include `birthdate` in OIDC scopes |
| **BIN changes per bank** | By design | BIN is per-bank pseudonymous; user may have different BIN per bank |
| **Address not returned** | Scope or bank limitation | Not all banks return address; check broker documentation |

## Resources

- [iDIN Official Website](https://www.idin.nl/)
- [Currence iDIN Documentation](https://www.currence.nl/en/payment-products/idin/)
- [Signicat iDIN Integration](https://developer.signicat.com/docs/authentication/idin/)
- [Ory OIDC Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/generic)
