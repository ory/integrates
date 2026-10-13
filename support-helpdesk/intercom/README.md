# Intercom

> **Maintained by:** Community contributors

[Intercom](https://www.intercom.com) is a customer messaging platform — live chat, product tours, support inbox. This integration syncs Ory identities into Intercom Contacts so chat / support / lifecycle messaging is identity-aware (and so the Intercom Messenger can authenticate users against Ory data).

**Type:** config (Ory Action calls Intercom REST API — wiring is Action config + Jsonnet, no first-party handler ships here)
**Docs page:** [ory.com/docs/integrates-with/support-helpdesk/intercom](https://www.ory.com/docs/integrates-with/support-helpdesk/intercom)

## How it works

1. User completes registration.
2. Ory fires an asynchronous Action (`response.ignore: true`) from the registration method lists, for example `selfservice.flows.registration.after.password.hooks`.
3. The Action calls Intercom's REST API directly to create the contact: `POST https://api.intercom.io/contacts` with `role: "user"` and the user's email / name / custom attributes.

The webhook URL is static and Ory ignores the response, so a direct call can only create contacts. To sync profile changes, or to store Intercom's contact `id` on the identity, point an action in `selfservice.flows.settings.after.profile.hooks` at your own handler, which finds the existing contact, updates it, and writes the ID with the Ory Admin API.

## Setup outline

1. In Intercom → **Settings** → **Workspace** → **Apps & integrations** → **Developer Hub** → create an internal app; copy the **Access Token**.
2. Configure an Ory Action in the registration method lists, such as `selfservice.flows.registration.after.password.hooks` and `selfservice.flows.registration.after.oidc.hooks`. Attach the action explicitly to each registration method you enable; on Ory Network, keep `session` last in the `password` list. See [Attach `after` actions to authentication methods](https://www.ory.com/docs/kratos/hooks/configure-hooks#attach-after-actions-to-authentication-methods).
   - URL: `https://api.intercom.io/contacts`.
   - Auth: `api_key` with `name: Authorization`, `value: Bearer <ACCESS_TOKEN>`, and `in: header`. Ory Network ignores the webhook `headers` setting, so the action can't send an `Intercom-Version` header; Intercom then applies the API version set for your app in the Developer Hub.
   - Body Jsonnet maps `identity.traits.email` → `email` and the name traits → `name`, plus any custom traits. Read optional traits with `std.get`, because Jsonnet fails on a missing field and Ory then drops the request.
   - `response.ignore: true` so Intercom availability never blocks user flows.

## Notable

- **Identity verification**: Intercom Messenger supports HMAC-based identity verification for authenticated visitors — set up `user_hash` in the Messenger config with the same shared secret you configure in Intercom's security settings. Prevents spoofing of authenticated chat sessions.
- Intercom rate limits at 10,000 calls/minute per workspace (Pro+) — generous for signup-rate flows.
- For tracking events on Intercom (e.g. "user verified email"), use the Events API (`POST /events`) instead of contact updates.

## Status

Community / proposed — no dedicated Ory documentation, no first-party handler.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
