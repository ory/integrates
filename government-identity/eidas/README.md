# eIDAS

> **Maintained by:** Community contributors

[eIDAS](https://digital-strategy.ec.europa.eu/en/policies/eidas-regulation) is the EU regulation that lets a citizen of one member state authenticate to services in another using their national electronic ID (German Personalausweis, Italian SPID, Belgian eID, French FranceConnect, Spanish DNI, etc.). **Direct eIDAS node access requires government approval**; integration usually goes through a commercial broker that exposes eIDAS as standard OIDC.

**Type:** config (generic OIDC provider in Kratos pointing at an eIDAS broker)
**Docs page:** [ory.com/docs/integrates-with/government-identity/eidas](https://www.ory.com/docs/integrates-with/government-identity/eidas)

## How to integrate eIDAS

```
Ory Kratos (OIDC, id="eidas", provider="generic")
        ↓
eIDAS broker (Signicat / Criipto / IDnow / yes.com)
        ↓
National eIDAS node (BE / DE / IT / FR / ES / NL / ...)
        ↓
ID token with verified identity claims back to Ory
```

Common brokers:

- [Signicat](https://www.signicat.com) — pan-European eID broker.
- [Criipto](https://www.criipto.com) — Nordic + EU.
- [IDnow](https://www.idnow.io) — identity verification with eIDAS support.
- [yes.com](https://yes.com) — German-focused eIDAS broker.

## Setup outline

1. Pick a broker; create an OIDC application; enable the eIDAS schemes you need.
2. Configure the Ory redirect URI as the broker's callback:
   `https://<project-slug>.projects.oryapis.com/self-service/methods/oidc/callback/eidas`
3. Configure as a generic OIDC provider in Ory Kratos with the broker's `issuer_url`, client id, secret, and scopes (`openid`, `profile`, plus broker-specific eIDAS scopes).
4. Map claims to identity traits + `metadata_public.eidas` via Jsonnet.

## Assurance levels

eIDAS defines three assurance levels — map these to Ory session AAL:

| eIDAS LoA | Description | Ory AAL |
| --- | --- | --- |
| Low | Minimal confidence (e.g., self-asserted) | aal1 |
| Substantial | Verified via national eID, no biometrics | aal1 / aal2 |
| High | Hardware-backed, biometric, or in-person | aal2 |

The broker reports the LoA in the ID token; map it in Jsonnet and surface as `metadata_public.eidas.loa` for downstream policy.

## Status

Community / proposed — no dedicated Ory documentation. Configures cleanly via a broker.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
