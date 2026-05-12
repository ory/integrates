# iDIN

> **Maintained by:** Community contributors

[iDIN](https://www.idin.nl) is the Dutch banks' identity-verification service — it lets users identify themselves online with the same credentials they use for online banking (ING, Rabobank, ABN AMRO, etc.) and returns bank-verified attributes (name, address, date of birth, 18+ flag). Widely used in the Netherlands for KYC, age verification, and onboarding.

**Type:** config (generic OIDC provider in Kratos pointing at an iDIN broker)
**Docs page:** No dedicated Ory page. Configures via the [generic OIDC provider](https://www.ory.com/docs/kratos/social-signin/generic) path.

## How to integrate iDIN

```
Ory Kratos (OIDC, id="idin", provider="generic")
        ↓
iDIN broker (Signicat / CM.com / Connective)
        ↓
User's Dutch bank (ING / Rabobank / ABN AMRO / ...)
        ↓
ID token with bank-verified identity claims back to Ory
```

Common brokers:

- [Signicat](https://www.signicat.com) — pan-European eID broker, supports iDIN.
- [CM.com](https://www.cm.com) — Dutch communications + identity.
- [Connective](https://connective.eu) — digital identity solutions.

## Setup outline

1. Pick a broker; create an OIDC application; enable iDIN.
2. Configure the Ory redirect URI as the broker's callback:
   `https://<project-slug>.projects.oryapis.com/self-service/methods/oidc/callback/idin`
3. Configure as a generic OIDC provider in Ory Kratos with the broker's `issuer_url`, client id, secret, and scopes (`openid`, `profile`, plus broker-specific iDIN scopes for name, address, DOB, age 18+).
4. Map claims to identity traits + `metadata_public.idin` via Jsonnet.

## Notes

- iDIN attributes are **bank-KYC verified** — the user's bank already ran a full KYC, so the data is high-confidence.
- Returns a `dateOfBirth` (sensitive PII — consider `metadata_admin`) or just an `is18OrOlder` flag if you only need the age check.
- BSN (Dutch citizen service number) is **not returned** by iDIN by default — there's a separate, restricted scope that requires Dutch government approval.
- Suitable for PSD2 SCA where the bank login itself is the strong-customer-authentication factor.

## Status

Community / proposed — no dedicated Ory documentation. Configures cleanly via a broker.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
