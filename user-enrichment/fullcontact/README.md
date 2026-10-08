# FullContact

> **Maintained by:** Community contributors

[FullContact](https://www.fullcontact.com) is a person/company data enrichment platform — resolves identity fragments (email, phone, social handle) into unified profiles. This integration enriches Ory identities post-registration with demographic, firmographic, and social data so downstream services can personalize and qualify leads without asking for extra form fields.

**Type:** webhook (Ory Action → handler → FullContact API → Ory admin patch) — wiring is Ory Action config + customer-implemented handler
**Docs page:** [ory.com/docs/integrates-with/user-enrichment/fullcontact](https://www.ory.com/docs/integrates-with/user-enrichment/fullcontact)

## How it works

1. User completes registration in your Ory-powered application.
2. Ory fires an async Action (`response.ignore: true`) from the registration method lists, for example `selfservice.flows.registration.after.password.hooks`, pointing at your handler. It runs after the identity is saved, so the handler receives the real identity ID.
3. Handler verifies the Ory webhook secret.
4. Handler calls FullContact's **Person Enrich API** (`POST https://api.fullcontact.com/v3/person.enrich`) with the user's email.
5. Handler PATCHes `metadata_public.fullcontact` on the Ory identity with the returned enrichment (name, location, photo, organization, social handles) via Ory admin API.

## Setup outline

1. Sign up at FullContact; create an **API Key** (server-side, all calls).
2. Build a small webhook handler implementing the above flow. SDK: native fetch + `@ory/client` for the admin PATCH.
3. Configure an async Ory Action (`response.ignore: true`) pointing at the handler with a shared secret in an `api_key` header. Attach the action to `selfservice.flows.registration.after.<method>.hooks` for each sign-up method you enable, such as `password` and `oidc`, not to the flow-level `after.hooks` list. On Ory Network, the `password` list contains `session`; keep it last. See [Attach `after` actions to authentication methods](https://www.ory.com/docs/kratos/hooks/configure-hooks#attach-after-actions-to-authentication-methods).

## Notable

- FullContact's enrichment is **best-effort** — coverage varies wildly by region and email type (personal vs business). Handler should silently no-op on 404 enrichment misses.
- Costs are per-resolved-record; configure FullContact's **multi-field resolution** to avoid wasting credits on emails that won't enrich.
- For deletion / right-to-be-forgotten compliance, FullContact's API also supports a delete call — wire it to your DSAR flow.

## Status

Community / proposed — no dedicated Ory documentation, no first-party handler.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
