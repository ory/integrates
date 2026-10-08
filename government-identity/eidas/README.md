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

eIDAS defines three levels of assurance (LoA): low, substantial, and high. The broker reports the level in the ID token's `acr` claim. The eIDAS specifications identify the levels as `http://eidas.europa.eu/LoA/low`, `http://eidas.europa.eu/LoA/substantial`, and `http://eidas.europa.eu/LoA/high`. Check which values your broker emits.

Decide which levels count as AAL2 for your sessions:

| eIDAS LoA | Description | Ory AAL |
| --- | --- | --- |
| Low | Minimal confidence (e.g., self-asserted) | aal1 |
| Substantial | Verified via national eID, no biometrics | aal1 / aal2 |
| High | Hardware-backed, biometric, or in-person | aal2 |

Mapping the LoA into identity metadata with Jsonnet doesn't change the session's authenticator assurance level (AAL). To mark a session as AAL2, list the matching `acr` values in the provider's `aal2_acr_values`. Ory compares them with the `acr` claim at every sign-in:

```yaml
selfservice:
  methods:
    oidc:
      enabled: true
      config:
        providers:
          - id: eidas
            provider: generic
            client_id: <your-client-id>
            client_secret: <your-client-secret>
            issuer_url: <your-broker-issuer-url>
            mapper_url: base64://<base64-encoded-jsonnet>
            scope:
              - openid
              - profile
            aal2_acr_values:
              - http://eidas.europa.eu/LoA/high
```

Sessions with any other `acr` value stay at AAL1. To ask the broker for a specific level, include `upstream_parameters: {"acr_values": "http://eidas.europa.eu/LoA/high"}` when submitting the login flow with `method: oidc` and the provider ID. See [Upstream MFA carry-over](https://www.ory.com/docs/kratos/social-signin/upstream-mfa).

You can still map the LoA to `metadata_public.eidas.loa` with Jsonnet for downstream policy.

## Status

Community / proposed — no dedicated Ory documentation. Configures cleanly via a broker.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
