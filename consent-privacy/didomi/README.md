# Didomi

> **Maintained by:** Community contributors

[Didomi](https://www.didomi.io) is a consent management platform (CMP) — collects, stores, and manages user consent for data processing under GDPR / CCPA / ePrivacy. This integration syncs Didomi consent state into Ory Network identity metadata so downstream services can read consent decisions alongside identity data, and uses Ory's admin API to fulfill data-subject requests (DSARs).

**Type:** config (Didomi-driven webhook + Ory admin API client — no first-party connector)
**Docs page:** No dedicated Didomi page on ory.com/docs. Pattern is Didomi → custom webhook → Ory admin API.

## Setup outline

1. In Didomi → **Consent Notice** → **Webhooks**, configure a webhook to fire on consent events with HMAC-signed payloads.
2. Deploy a small service that:
   - Verifies the Didomi HMAC signature.
   - Resolves the Ory identity by Didomi's `user_id` (typically matched against Ory's identity trait carrying the same id, or `metadata_public.didomi_user_id`).
   - PATCHes `metadata_public.consent.didomi` on the identity with the consent record (purposes consented, vendors, timestamp, consent string).
3. For **DSAR fulfillment** (GDPR Article 15 / 17 access + erasure):
   - Didomi forwards the request to your handler.
   - Handler queries `GET /admin/identities/{id}` and returns / deletes per Article requirements.
   - For erasure, `DELETE /admin/identities/{id}` removes the identity from Ory.

## Notable

- Didomi consent strings (TCF v2 + Didomi-specific) are long; store in `metadata_public` only — they're not credentials.
- DSAR responses are time-bounded (typically 30 days under GDPR); design the handler for reliable processing, not best-effort.
- The webhook handler is the integration — Ory itself doesn't know about Didomi.

## Status

Community / proposed — no dedicated Ory documentation, no first-party Didomi connector. Implementation lives in the customer's webhook handler.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
