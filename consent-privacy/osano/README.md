# Osano

> **Maintained by:** Community contributors

[Osano](https://www.osano.com) is a data-privacy platform — consent management, data discovery, vendor monitoring for GDPR / CCPA / LGPD compliance. This integration syncs Osano consent state into Ory Network identity metadata and handles data-subject requests (DSARs) via Ory's admin API.

**Type:** config (Osano-driven webhook + Ory admin API client — no first-party connector)
**Docs page:** [ory.com/docs/integrates-with/consent-privacy/osano](https://www.ory.com/docs/integrates-with/consent-privacy/osano)

## Setup outline

1. In Osano → **Subject Rights** → **Integrations**, configure a webhook for consent and DSAR events.
2. Deploy a small service that:
   - Verifies Osano's webhook signature.
   - Resolves the Ory identity from the Osano user ID with `GET /admin/identities/by/external/{externalID}`. For this, set the identity's `external_id` to the Osano user ID when you create the identity, or later with a JSON Patch on `/external_id`. The Admin API can't look up identities by metadata.
   - Reads the identity's current `metadata_public`. In one JSON Patch request (`PATCH /admin/identities/{id}`), initializes `/metadata_public` to `{}` only if it is null or absent, then initializes `/metadata_public/consent` to `{}` only if it is null or absent, and finally adds `/metadata_public/consent/osano` with the consent record (purposes, timestamp, jurisdiction). Preserve existing metadata and other consent providers' values. Serialize updates for the same identity so concurrent events don't overwrite each other's initialization.
3. For **DSAR fulfillment** (GDPR Article 15 / 17 / 20 — access, erasure, portability):
   - Osano forwards the request to your handler.
   - Handler queries `GET /admin/identities/{id}` (access) or `DELETE /admin/identities/{id}` (erasure).
   - For portability, return identity traits in a machine-readable format.

## Notable

- Osano's strength is DSAR workflow orchestration — the integration's value is wiring Osano's request tracking into Ory's identity store as the source of truth.
- DSAR responses are time-bounded (typically 30 days under GDPR / 45 days under CCPA); design the handler for reliable processing.
- The webhook handler is the integration — Ory itself doesn't know about Osano.

## Status

Community / proposed — no dedicated Ory documentation, no first-party Osano connector. Implementation lives in the customer's webhook handler.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
