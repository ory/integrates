# Rippling

> **Maintained by:** Ory Engineering

Configure [Rippling](https://www.rippling.com) — the unified workforce platform combining HR, IT, and Finance — as a SAML 2.0 Identity Provider into Ory Polis. Less common as a pure SSO IdP than Okta or Entra ID, but a natural fit for organizations already using Rippling for HR/IT-driven access lifecycle (onboard / offboard / role-change events trigger access changes automatically).

**Type:** config (Polis SAML connection — no webhook code)
**Docs page:** [ory.com/docs/polis/sso-providers/rippling](https://www.ory.com/docs/polis/sso-providers/rippling)

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/polis/sso-providers/rippling). Short version:

1. In the **Rippling Admin Portal** → **IT Management** → **Single Sign-On** → **Add Custom App** → choose **SAML**.
2. Configure the SAML configuration with values from your Ory Network organization's setup-link:
   - **ACS URL**, **SP Entity ID**.
3. Configure attribute mapping — Rippling maps HR fields (work email, first name, last name, department, employee ID) to SAML attributes.
4. Define **role-based access policies** in Rippling — who in the workforce gets access to this app. The HR-driven assignment is Rippling's distinguishing feature.
5. Download the **IdP metadata** XML and paste into Ory.

## Notes

- Rippling's value here is the **HR + IT bundling** — when an employee changes role or leaves, Rippling automatically removes them from the SAML app's assigned users, which deactivates SSO access.
- For SCIM provisioning of Rippling users into Ory (matching the SSO assignments to Ory user records), Rippling's SCIM module is a separate add-on; configure it pointing at Ory Network's SCIM endpoint.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
