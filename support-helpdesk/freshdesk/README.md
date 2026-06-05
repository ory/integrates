# Freshdesk

> **Maintained by:** Community contributors

[Freshdesk](https://www.freshworks.com/freshdesk/) is a customer support platform (ticketing, collaboration, automation). This integration syncs Ory identities into Freshdesk Contacts so support agents see Ory identity context (verification state, MFA enrollment, recent activity) when handling tickets.

**Type:** config (Ory Action calls Freshdesk REST API — wiring is Action config + Jsonnet, no first-party handler ships here)
**Docs page:** [ory.com/docs/integrates-with/support-helpdesk/freshdesk](https://www.ory.com/docs/integrates-with/support-helpdesk/freshdesk)

## How it works

1. User completes registration / profile update in your Ory-powered application.
2. Ory fires an Action on `registration.after` / `settings.after` (async).
3. The Action's Jsonnet body calls Freshdesk's REST API to upsert the contact: `POST /api/v2/contacts` (or `PUT /api/v2/contacts/{id}` for updates).
4. Optional: write the Ory identity id to a Freshdesk **custom contact field** for stable cross-system lookup.

## Setup outline

1. In Freshdesk → **Admin** → **API Settings**, copy the **API key** for the integration user.
2. Optional: create a **custom contact field** named `ory_identity_id` so agents can correlate tickets to Ory identities.
3. Configure an Ory Action on `registration.after` (and/or `settings.after`):
   - URL: `https://<your-domain>.freshdesk.com/api/v2/contacts`.
   - Auth: HTTP Basic, username = API key, password = `X` (Freshdesk's convention).
   - Body Jsonnet maps `identity.traits.email` → `email`, `identity.traits.name.first` → `first_name`, etc.
   - `response.ignore: true` so Freshdesk availability never blocks user flows.

## Notes

- Freshdesk API rate limits are per-account (typically 50-200 calls/min depending on plan); high-volume signup may need batching.
- Upserting via POST returns 409 if the contact already exists by email — handler should treat 409 as success.
- For showing Ory identity context **inside** Freshdesk tickets, consider a Freshdesk **App** (custom app in their Marketplace) that calls Ory's admin API; that's a separate integration not covered here.

## Status

Community / proposed — no dedicated Ory documentation, no first-party handler.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
