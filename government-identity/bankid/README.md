# BankID

> **Maintained by:** Community contributors

[BankID](https://www.bankid.com) is the high-assurance electronic identity used in Sweden and Norway — issued by banks, eIDAS Substantial/High assurance, and the de-facto authentication for banking, public services, and healthcare in those markets. **Direct BankID API access is restricted to licensed providers**; integration goes through an OIDC broker that wraps BankID for general use.

**Type:** config (generic OIDC provider in Kratos pointing at a BankID broker)
**Docs page:** [ory.com/docs/integrates-with/government-identity/bankid](https://www.ory.com/docs/integrates-with/government-identity/bankid)

## How to integrate BankID

Use a broker that exposes BankID as standard OIDC:

```
Ory Kratos (OIDC, id="bankid", provider="generic")
        ↓
Broker (Criipto / Signicat / Nets) — handles BankID's licensing + protocol
        ↓
BankID infrastructure (Sweden / Norway)
        ↓
ID token with verified identity claims back to Ory
```

Common brokers:

- [Criipto](https://www.criipto.com) — Nordic eID as OIDC; cleanest fit for the Kratos generic provider.
- [Signicat](https://www.signicat.com) — Nordic eID broker.
- [Nets](https://www.nets.eu) — payment + eID services.

## Setup outline

1. Pick a broker; create an application; enable Swedish BankID and/or Norwegian BankID.
2. Configure the Ory redirect URI as the callback in the broker:
   `https://<project-slug>.projects.oryapis.com/self-service/methods/oidc/callback/bankid`
3. Configure as a generic OIDC provider in Ory Kratos with the broker's `issuer_url`, client id, and client secret. Common scopes: `openid`, `profile`, `ssn` (the personal-number scope name varies per broker).
4. Map the broker's claims to Ory identity traits + `metadata_public.bankid` via Jsonnet — typically the personal number (Swedish `personnummer` or Norwegian fødselsnummer), name, and country.

## Notable

- Broker contracts include data-processing terms; review with legal before going live.
- **Personal numbers are sensitive PII** — consider storing them in `metadata_admin` (admin-only access) rather than `metadata_public`.
- BankID satisfies PSD2 Strong Customer Authentication (SCA) requirements.
- Norwegian BankID exists in two assurance levels (Substantial via mobile, High via desktop / hardware token).

## Status

Community / proposed — no dedicated Ory documentation. Configures cleanly as a generic OIDC provider once you've chosen a broker.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
