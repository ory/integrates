# Aadhaar

> **Maintained by:** Community contributors

[Aadhaar](https://uidai.gov.in) is India's biometric identity system administered by UIDAI — a 12-digit identifier issued to over 1.3 billion residents, backed by biometric (fingerprint, iris) and demographic data. **Not natively supported by Ory** — UIDAI restricts direct API access to licensed Authentication Service Agencies (ASA) and Authentication User Agencies (AUA). This integration goes through a licensed third-party provider.

**Type:** config (architectural pattern via Ory Actions webhook to a licensed eKYC provider)
**Docs page:** [ory.com/docs/integrates-with/government-identity/aadhaar](https://www.ory.com/docs/integrates-with/government-identity/aadhaar)

## How to integrate Aadhaar

A licensed eKYC provider sits between your service and UIDAI:

```
Ory Kratos webhook  →  Your verification service  →  Licensed ASA/AUA  →  UIDAI CIDR
```

Common licensed providers:

- [Signzy](https://signzy.com/products/aadhaar-verification)
- [Digio](https://www.digio.in/) — Aadhaar eSign + eKYC
- [Karza Technologies](https://karza.in/)
- [IDfy](https://idfy.com/)

## Setup outline

1. Sign up with a licensed Aadhaar eKYC provider; complete KYB and licensing.
2. Configure an Ory Actions webhook on `registration.after` (async) pointing at your verification service.
3. Your service kicks off the OTP-based eKYC flow with the licensed provider.
4. After the user completes OTP verification, write the verified eKYC fields back to Ory `metadata_public.aadhaar` via the Kratos Admin API.

## Compliance must-haves

UIDAI rules are strict — these are non-negotiable:

- **Never store the full Aadhaar number** — only masked or last-4 digits.
- **Explicit consent before each authentication** — pass `consent: "Y"` on every call.
- **Data localization** — Aadhaar-derived data must be stored within India. Ory Network is global, so keep full eKYC payloads in India-hosted infrastructure and only persist verified-status flags + masked identifiers in Ory metadata.
- **Audit trail** — retain authentication transaction logs for 5 years.
- **Aadhaar Act 2016**: §28 restricts sharing core biometric data; §29 restricts storing it; §33 restricts disclosure.

## Status

Community / proposed — no dedicated Ory documentation. The integration is fundamentally outsourced to a licensed provider.

## Resources

- [UIDAI Developer Portal](https://developer.uidai.gov.in/)
- [Aadhaar Act 2016](https://uidai.gov.in/legal-framework/aadhaar-act.html)

## License

Apache-2.0. (Configuration / pattern — no source code in this directory.)
