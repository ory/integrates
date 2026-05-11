# Discord

> **Maintained by:** Ory Engineering

Add Discord as a social sign-in provider in Ory Network. Users sign in with their Discord account; Ory maps Discord's OAuth2 response (username, email, avatar, guild/server membership) to the identity schema. Common in gaming, community, and creator-facing products.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/kratos/social-signin/discord](https://www.ory.com/docs/kratos/social-signin/discord)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/discord). Short version:

1. In the [Discord Developer Portal → Applications](https://discord.com/developers/applications), create a new application and open **OAuth2**. Add the redirect URI from the Ory Console.
2. Copy the Client ID and Client Secret into the Ory Console's Discord form.
3. Add the `identify` and `email` scopes (and `guilds` if you want to gate on server membership). Paste the Jsonnet data-mapping snippet from the docs page.
4. Save and trigger a registration flow to test.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
