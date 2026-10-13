# Freshdesk

> **Maintained by:** Community contributors

[Freshdesk](https://www.freshworks.com/freshdesk/) is a customer support platform (ticketing, collaboration, automation). This integration syncs Ory identities into Freshdesk Contacts so support agents see Ory identity context (verification state, MFA enrollment, recent activity) when handling tickets.

**Type:** config (Ory Action calls Freshdesk REST API — wiring is Action config + Jsonnet, no first-party handler ships here)
**Docs page:** [ory.com/docs/integrates-with/support-helpdesk/freshdesk](https://www.ory.com/docs/integrates-with/support-helpdesk/freshdesk)

## How it works

1. User completes registration in your Ory-powered application.
2. Ory fires an asynchronous Action (`response.ignore: true`) from the registration method lists, for example `selfservice.flows.registration.after.password.hooks`.
3. The Action calls Freshdesk's REST API directly to create the contact: `POST /api/v2/contacts`. The webhook URL is static, so a direct call can't update an existing contact. To sync profile changes, point an action in `selfservice.flows.settings.after.profile.hooks` at your own handler, which finds the contact and updates it with `PUT /api/v2/contacts/{id}`.
4. Optional: write the Ory identity id to a Freshdesk **custom contact field** for stable cross-system lookup.

## Setup outline

1. In Freshdesk → **Admin** → **API Settings**, copy the **API key** for the integration user.
2. Optional: create a **custom contact field** named `ory_identity_id` so agents can correlate tickets to Ory identities.
3. Configure an Ory Action in the registration method lists, such as `selfservice.flows.registration.after.password.hooks` and `selfservice.flows.registration.after.oidc.hooks`. Attach the action explicitly to each registration method you enable; on Ory Network, keep `session` last in the `password` list. See [Attach `after` actions to authentication methods](https://www.ory.com/docs/kratos/hooks/configure-hooks#attach-after-actions-to-authentication-methods).
   - URL: `https://<your-domain>.freshdesk.com/api/v2/contacts`.
   - Auth: `basic_auth`, with `user` set to the API key and `password` set to `X` (Freshdesk's convention).
   - Body Jsonnet maps `identity.traits.email` → `email` and the name traits → `name`. Read optional traits with `std.get`, because Jsonnet fails on a missing field and Ory then drops the request.
   - `response.ignore: true` so Freshdesk availability never blocks user flows.

## Notes

- Freshdesk API rate limits are per-account (typically 50-200 calls/min depending on plan); high-volume signup may need batching.
- The POST returns 409 if a contact with the same email already exists. The action ignores the response, so Ory only logs the failure.
- For showing Ory identity context **inside** Freshdesk tickets, consider a Freshdesk **App** (custom app in their Marketplace) that calls Ory's admin API; that's a separate integration not covered here.

## Status

Community / proposed — no dedicated Ory documentation, no first-party handler.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
