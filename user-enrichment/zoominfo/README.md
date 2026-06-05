# ZoomInfo

> **Maintained by:** Community contributors

[ZoomInfo](https://www.zoominfo.com) is a B2B data intelligence platform — contact, company, and intent data for sales, marketing, and recruiting. This integration enriches Ory identities post-registration with B2B contact + company data so newly registered users land in your funnel pre-qualified.

**Type:** webhook (Ory Action → handler → ZoomInfo API → Ory admin patch) — wiring is Ory Action config + customer-implemented handler
**Docs page:** [ory.com/docs/integrates-with/user-enrichment/zoominfo](https://www.ory.com/docs/integrates-with/user-enrichment/zoominfo)

## How it works

1. User completes registration in your Ory-powered application.
2. Ory fires an async Action on `registration.after` (`response.ignore: true`) pointing at your handler.
3. Handler verifies the Ory webhook secret.
4. Handler authenticates against ZoomInfo (OAuth2 client credentials) and calls the **Enrich API** (e.g. `POST https://api.zoominfo.com/enrich/contact`) with the user's email.
5. Handler PATCHes `metadata_public.zoominfo` on the Ory identity with the returned data (job title, department, company name, company size, industry, location) via Ory admin API.

## Setup outline

1. ZoomInfo licensing is the long pole — Enrich API access is a paid add-on requiring a sales conversation; you'll get OAuth2 client credentials.
2. Build a small webhook handler implementing the above flow. SDK: native fetch + `@ory/client` for the admin PATCH.
3. Configure an Ory Action on `registration.after` (async) pointing at the handler with a shared secret.

## Notable

- ZoomInfo Enrich API is **B2B-focused** — personal-email signups (gmail, outlook) won't resolve; gate the API call on a known-business-email check to avoid wasting credits.
- Enrichment data quality is generally high for US-based business contacts; EU coverage is weaker and may be subject to GDPR-driven opt-outs.
- For high-confidence intent signals (visited pricing page, downloaded whitepaper), pair with ZoomInfo's intent product — separate API, not covered here.
- Per-resolved-record billing; configure conservative match thresholds.

## Status

Community / proposed — no dedicated Ory documentation, no first-party handler.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
