# eIDAS Integration with Ory Network

## Overview

eIDAS (electronic IDentification, Authentication and trust Services) is a European Union regulation that establishes a framework for cross-border electronic identification and trust services. Through eIDAS, citizens of EU member states can use their national electronic identity (eID) to access services in other member states. This integration connects Ory Network to eIDAS-compliant identity providers through an eIDAS node or commercial broker, enabling cross-border identity verification for EU services.

Key integration capabilities:
- Cross-border EU electronic identification via eIDAS nodes
- Assurance level mapping (Low, Substantial, High) to Ory session AAL
- National eID schemes (German Personalausweis, Italian SPID, Belgian eID, etc.)
- Integration via eIDAS node or commercial broker (Signicat, IDnow, etc.)
- Verified identity attributes stored in Ory identity metadata

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │    │              │
│   EU Citizen │─1─▶│  Ory Kratos  │─2─▶│  eIDAS       │─3─▶│  National    │
│   Browser    │    │  (OIDC)      │    │  Node/Broker │    │  eID Scheme  │
│              │    │              │    │              │    │  (DE/IT/BE/  │
│              │◀─6─│              │◀─5─│              │◀─4─│   FR/ES...) │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘

Flow:
1. User selects their country's eID for authentication
2. Ory redirects to eIDAS node/broker OIDC endpoint
3. eIDAS node routes to the appropriate national eID scheme
4. User authenticates with their national eID (card reader, mobile app, etc.)
5. eIDAS node returns verified identity attributes via OIDC
6. Ory creates/updates identity with verified data and assurance level
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Configures eIDAS broker as OIDC provider. Stores verified eIDAS attributes. |
| **Ory Network OIDC** | Standard OIDC integration with eIDAS broker. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **eIDAS Integration Path** (choose one):
  - **eIDAS Node**: Direct connection to a national eIDAS node (requires government approval)
  - **Commercial Broker**: Licensed eIDAS intermediary such as:
    - [Signicat](https://www.signicat.com/) — Pan-European eID broker
    - [Criipto](https://www.criipto.com/) — Nordic/EU eID broker
    - [IDnow](https://www.idnow.io/) — Identity verification with eIDAS
    - [yes.com](https://yes.com/) — German eIDAS broker
- **Broker OIDC Credentials**: Client ID and secret
- **Service Provider Registration**: May require registration with national eIDAS infrastructure

## Configuration

### Step 1: Set Up eIDAS Broker

Using Signicat as an example:

1. Sign up at [Signicat Dashboard](https://dashboard.signicat.com/)
2. Create an OIDC application
3. Enable eIDAS identity schemes for target countries
4. Configure the callback URL: `https://<your-ory-project>.projects.oryapis.com/self-service/methods/oidc/callback/eidas`
5. Note the **OIDC Discovery URL**, **Client ID**, and **Client Secret**

### Step 2: Configure Ory OIDC Provider

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/methods/oidc/enabled=true' \
  --add '/selfservice/methods/oidc/config/providers/0/id="eidas"' \
  --add '/selfservice/methods/oidc/config/providers/0/provider="generic"' \
  --add '/selfservice/methods/oidc/config/providers/0/client_id="<broker-client-id>"' \
  --add '/selfservice/methods/oidc/config/providers/0/client_secret="<broker-client-secret>"' \
  --add '/selfservice/methods/oidc/config/providers/0/issuer_url="https://your-broker.com"' \
  --add '/selfservice/methods/oidc/config/providers/0/label="EU eID (eIDAS)"' \
  --add '/selfservice/methods/oidc/config/providers/0/scope=["openid","profile","eidas"]' \
  --add '/selfservice/methods/oidc/config/providers/0/mapper_url="file:///etc/config/kratos/eidas-mapper.jsonnet"'
```

### Step 3: Create Identity Mapper

**`eidas-mapper.jsonnet`:**

```jsonnet
local claims = std.extVar('claims');

// Map eIDAS assurance level to a standardized value
local assuranceLevel =
  if std.objectHas(claims, 'acr') then
    if claims.acr == 'http://eidas.europa.eu/LoA/high' then 'high'
    else if claims.acr == 'http://eidas.europa.eu/LoA/substantial' then 'substantial'
    else if claims.acr == 'http://eidas.europa.eu/LoA/low' then 'low'
    else claims.acr
  else 'unknown';

{
  identity: {
    traits: {
      email: if std.objectHas(claims, 'email') then claims.email else null,
      name: {
        first: if std.objectHas(claims, 'given_name') then claims.given_name
               else if std.objectHas(claims, 'FirstName') then claims.FirstName
               else null,
        last: if std.objectHas(claims, 'family_name') then claims.family_name
              else if std.objectHas(claims, 'FamilyName') then claims.FamilyName
              else null,
      },
    },
    metadata_public: {
      eidas: {
        verified: true,
        assurance_level: assuranceLevel,
        // eIDAS minimum dataset attributes
        person_identifier: if std.objectHas(claims, 'PersonIdentifier') then claims.PersonIdentifier
                          else if std.objectHas(claims, 'sub') then claims.sub
                          else null,
        date_of_birth: if std.objectHas(claims, 'DateOfBirth') then claims.DateOfBirth
                      else if std.objectHas(claims, 'birthdate') then claims.birthdate
                      else null,
        nationality: if std.objectHas(claims, 'nationality') then claims.nationality else null,
        country_of_origin: if std.objectHas(claims, 'country') then claims.country
                          else if std.objectHas(claims, 'issuing_country') then claims.issuing_country
                          else null,
        identity_scheme: if std.objectHas(claims, 'identityscheme') then claims.identityscheme else null,
        verified_at: if std.objectHas(claims, 'iat') then claims.iat else null,
      },
    },
  },
}
```

## eIDAS Assurance Level Mapping

| eIDAS Level | ACR Value | Description | Ory AAL Recommendation |
|-------------|-----------|-------------|----------------------|
| **Low** | `http://eidas.europa.eu/LoA/low` | Basic identity verification (e.g., username/password with email confirmation) | AAL1 |
| **Substantial** | `http://eidas.europa.eu/LoA/substantial` | Multi-factor authentication with verified identity | AAL1 (with eIDAS metadata) |
| **High** | `http://eidas.europa.eu/LoA/high` | Hardware-based authentication (smart card, eID card with PIN) | AAL2 |

## Supported National eID Schemes

| Country | eID Scheme | Assurance Level | Notes |
|---------|-----------|-----------------|-------|
| Germany | Personalausweis (nPA) | High | NFC-based eID card |
| Italy | SPID | Low/Substantial/High | Three levels available |
| Belgium | Belgian eID | High | Smart card with PIN |
| Estonia | ID-card / Mobile-ID / Smart-ID | High | Advanced digital identity |
| Spain | DNIe | High | Electronic national ID |
| France | FranceConnect | Substantial | National identity gateway |
| Netherlands | DigiD | Substantial | Government digital identity |
| Sweden | BankID | Substantial/High | Bank-issued eID |
| Norway | BankID / ID-porten | Substantial | Government/bank identity |
| Portugal | Chave Movel Digital | Substantial | Mobile digital key |

## eIDAS Minimum Dataset

The eIDAS regulation defines a minimum dataset that must be provided for cross-border identification:

**Natural Persons:**
- First name(s)
- Surname(s)
- Date of birth
- Unique person identifier

**Legal Persons (optional):**
- Legal person name
- Legal person identifier

## Testing

### 1. Test with Broker Sandbox

Most brokers provide test environments:

```bash
# Verify OIDC discovery
curl -s https://your-broker.com/.well-known/openid-configuration | jq '.authorization_endpoint'
```

### 2. Test Authentication Flow

1. Navigate to your application login page
2. Select "EU eID (eIDAS)" as the sign-in method
3. Choose your country's eID scheme (in test mode)
4. Complete authentication with test credentials
5. Verify identity creation in Ory

### 3. Verify Identity Data

```bash
ory get identity <identity-id> --project <project-id> --format json | \
  jq '.metadata_public.eidas'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Country not available** | eID scheme not enabled at broker | Enable the country's scheme in broker dashboard |
| **Missing assurance level** | ACR not returned | Ensure `eidas` scope is requested; check broker configuration |
| **Identity attributes incomplete** | Claims mapping issue | Verify Jsonnet mapper handles broker-specific claim names |
| **Cross-border error** | eIDAS node connectivity | Check broker status page; may be national node maintenance |
| **OIDC callback error** | Redirect URI mismatch | Verify callback URL in broker matches Ory configuration |

## Compliance Notes

- eIDAS regulation (EU 910/2014) mandates mutual recognition of notified eID schemes
- Processing of eIDAS identity data must comply with GDPR
- Person identifiers are unique per country and should be treated as sensitive PII
- Some member states require specific agreements for eIDAS service access
- Keep track of the eIDAS 2.0 revision (EU Digital Identity Wallet) for upcoming changes

## Resources

- [eIDAS Regulation (EU 910/2014)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=uriserv:OJ.L_.2014.257.01.0073.01.ENG)
- [CEF eIDAS Technical Specifications](https://ec.europa.eu/digital-building-blocks/wikis/display/DIGITAL/eID)
- [Signicat eIDAS Integration](https://developer.signicat.com/docs/authentication/eidas/)
- [Criipto eID Verification](https://docs.criipto.com/verify/e-ids/)
- [Ory OIDC Social Sign-In](https://www.ory.sh/docs/kratos/social-signin/generic)
- [eIDAS Dashboard — Notified Schemes](https://ec.europa.eu/digital-building-blocks/wikis/display/DIGITAL/eID+eIDAS+Notification)
