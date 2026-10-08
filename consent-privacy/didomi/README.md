# Didomi

> **Maintained by:** Community contributors

[Didomi](https://www.didomi.io) is a consent management platform (CMP) — collects, stores, and manages user consent for data processing under GDPR / CCPA / ePrivacy. This integration syncs Didomi consent state into Ory Network identity metadata so downstream services can read consent decisions alongside identity data, and uses Ory's admin API to fulfill data-subject requests (DSARs).

**Type:** config (Didomi-driven webhook + Ory admin API client — no first-party connector)
**Docs page:** [ory.com/docs/integrates-with/consent-privacy/didomi](https://www.ory.com/docs/integrates-with/consent-privacy/didomi)

## Setup outline

1. In Didomi → **Consent Notice** → **Webhooks**, configure a webhook to fire on consent events with HMAC-signed payloads.
2. Deploy a small service that:
   - Verifies the Didomi HMAC signature.
   - Resolves the Ory identity from the Didomi user ID with `GET /admin/identities/by/external/{externalID}`. For this, set the identity's `external_id` to the Didomi user ID when you create the identity, or later with a JSON Patch on `/external_id`. The Admin API can't look up identities by metadata.
   - Reads the identity's current `metadata_public`. In one JSON Patch request (`PATCH /admin/identities/{id}`), initializes `/metadata_public` to `{}` only if it is null or absent, then initializes `/metadata_public/consent` to `{}` only if it is null or absent, and finally adds `/metadata_public/consent/didomi` with the consent record (purposes consented, vendors, timestamp, consent string). Preserve existing metadata and other consent providers' values. Serialize updates for the same identity so concurrent events don't overwrite each other's initialization.
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
