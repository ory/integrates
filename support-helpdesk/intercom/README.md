# Intercom

> **Maintained by:** Community contributors

[Intercom](https://www.intercom.com) is a customer messaging platform — live chat, product tours, support inbox. This integration syncs Ory identities into Intercom Contacts so chat / support / lifecycle messaging is identity-aware (and so the Intercom Messenger can authenticate users against Ory data).

**Type:** config (Ory Action calls Intercom REST API — wiring is Action config + Jsonnet, no first-party handler ships here)
**Docs page:** No dedicated Intercom page on ory.com/docs.

## How it works

1. User completes registration / profile update.
2. Ory fires an Action on `registration.after` / `settings.after` (async).
3. The Action's Jsonnet body calls Intercom's REST API to upsert the contact: `POST https://api.intercom.io/contacts` with `role: "user"` and the user's email / name / custom attributes.
4. The handler stores Intercom's returned `id` on the Ory identity's `metadata_public.intercom_id` (optional but useful for downstream calls).

## Setup outline

1. In Intercom → **Settings** → **Workspace** → **Apps & integrations** → **Developer Hub** → create an internal app; copy the **Access Token**.
2. Configure an Ory Action on `registration.after` (and/or `settings.after`):
   - URL: `https://api.intercom.io/contacts`.
   - Auth: header `Authorization: Bearer <ACCESS_TOKEN>`, plus `Intercom-Version: 2.11` (or current stable).
   - Body Jsonnet maps `identity.traits.email` → `email`, `identity.traits.name` → `name`, plus any custom traits.
   - `response.ignore: true` so Intercom availability never blocks user flows.

## Notable

- **Identity verification**: Intercom Messenger supports HMAC-based identity verification for authenticated visitors — set up `user_hash` in the Messenger config with the same shared secret you configure in Intercom's security settings. Prevents spoofing of authenticated chat sessions.
- Intercom rate limits at 10,000 calls/minute per workspace (Pro+) — generous for signup-rate flows.
- For tracking events on Intercom (e.g. "user verified email"), use the Events API (`POST /events`) instead of contact updates.

## Status

Community / proposed — no dedicated Ory documentation, no first-party handler.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
