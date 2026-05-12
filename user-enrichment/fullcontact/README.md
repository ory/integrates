# FullContact

> **Maintained by:** Community contributors

[FullContact](https://www.fullcontact.com) is a person/company data enrichment platform — resolves identity fragments (email, phone, social handle) into unified profiles. This integration enriches Ory identities post-registration with demographic, firmographic, and social data so downstream services can personalize and qualify leads without asking for extra form fields.

**Type:** webhook (Ory Action → handler → FullContact API → Ory admin patch) — wiring is Ory Action config + customer-implemented handler
**Docs page:** No dedicated FullContact page on ory.com/docs.

## How it works

1. User completes registration in your Ory-powered application.
2. Ory fires an async Action on `registration.after` (`response.ignore: true`) pointing at your handler.
3. Handler verifies the Ory webhook secret.
4. Handler calls FullContact's **Person Enrich API** (`POST https://api.fullcontact.com/v3/person.enrich`) with the user's email.
5. Handler PATCHes `metadata_public.fullcontact` on the Ory identity with the returned enrichment (name, location, photo, organization, social handles) via Ory admin API.

## Setup outline

1. Sign up at FullContact; create an **API Key** (server-side, all calls).
2. Build a small webhook handler implementing the above flow. SDK: native fetch + `@ory/client` for the admin PATCH.
3. Configure an Ory Action on `registration.after` (async) pointing at the handler with a shared secret.

## Notable

- FullContact's enrichment is **best-effort** — coverage varies wildly by region and email type (personal vs business). Handler should silently no-op on 404 enrichment misses.
- Costs are per-resolved-record; configure FullContact's **multi-field resolution** to avoid wasting credits on emails that won't enrich.
- For deletion / right-to-be-forgotten compliance, FullContact's API also supports a delete call — wire it to your DSAR flow.

## Status

Community / proposed — no dedicated Ory documentation, no first-party handler.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
