# Apple

> **Maintained by:** Ory Engineering

Add Sign in with Apple as a social sign-in provider in Ory Network. Apple uses a privacy-focused OAuth2 flow with **Hide My Email** relay addresses and requires JWT-signed client assertions (Apple Team ID + Private Key) rather than a plain client secret. Required for iOS apps that offer any third-party social login per App Store guidelines.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/social-sign-in/apple](https://www.ory.com/docs/integrates-with/social-sign-in/apple) — full guide: [ory.com/docs/kratos/social-signin/apple](https://www.ory.com/docs/kratos/social-signin/apple)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/apple). Short version:

1. In the [Apple Developer console](https://developer.apple.com/account/resources/identifiers/list) create:
   - An **App ID** with **Sign in with Apple** capability enabled.
   - A **Services ID** linked to the App ID; configure the Ory redirect URI as the Return URL.
   - A **Key** with Sign in with Apple enabled, primary AppID set, and download the `.p8` private key file.
2. In the Ory Console's Apple form, paste the **Services ID identifier** as Client ID, the entire `.p8` file contents as the Private Key (including BEGIN/END lines), and your Apple Team ID and Key ID.
3. Add the `email` scope and the Jsonnet data-mapping snippet from the docs page.
4. The provider ID **must be `apple`** so Ory exempts the resulting POST callback from CSRF middleware (Apple uses a form POST that doesn't include the CSRF cookie).
5. For native iOS apps, follow the "Native iOS app" section on the docs page — Apple's SDK returns an id_token that's exchanged at Ory.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
