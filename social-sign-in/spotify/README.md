# Spotify

> **Maintained by:** Ory Engineering

Add Log in with Spotify as a social sign-in provider in Ory Network. Users sign in with their Spotify account; Ory maps Spotify's OAuth2 response (id, email, display name, country, product tier) to the identity schema. Common in music apps, entertainment platforms, and creator tools.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/kratos/social-signin/spotify](https://www.ory.com/docs/kratos/social-signin/spotify)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/spotify). Short version:

1. In the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), create a new app. Add the redirect URI from the Ory Console under **Redirect URIs**.
2. Copy the Client ID and Client Secret into the Ory Console's Spotify form.
3. Add the `user-read-email` and `user-read-private` scopes (and any music-data scopes you need) plus the Jsonnet data-mapping snippet from the docs page.
4. Save and trigger a registration flow to test.

Spotify keeps user authorizations under quota during Development mode (you can only sign in with users on a whitelist). Submit the app for review to enable production mode and remove the cap.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
