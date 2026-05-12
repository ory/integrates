# LINE

> **Maintained by:** Ory Engineering

Add LINE Login as a social sign-in provider in Ory Network. LINE is the dominant messaging app in Japan, Taiwan, and Thailand — the natural sign-in option for consumer products targeting users in those markets.

**Type:** config (Ory Console / CLI — no webhook code)
**Docs page:** [ory.com/docs/kratos/social-signin/line](https://www.ory.com/docs/kratos/social-signin/line)

## Setup

The full walkthrough (with screenshots and the Ory CLI alternative) lives in the [Ory docs page above](https://www.ory.com/docs/kratos/social-signin/line). Short version:

1. Create a [LINE Business Account](https://account.line.biz/signup) and a new channel in the [LINE Developer Console](https://developers.line.biz/console/).
2. On the channel, enable the `PROFILE`, `OPENID_CONNECT`, and `OC_EMAIL` permissions and add the redirect URI from the Ory Console as a Callback URL.
3. Copy the Channel ID (Client ID) and Channel Secret (Client Secret) into the Ory Console's LINE form.
4. Add the Jsonnet data-mapping snippet from the docs page (default maps `email` and `name` → `first_name`).
5. Save and trigger a registration flow to test.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
