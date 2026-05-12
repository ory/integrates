# PingOne

> **Maintained by:** Ory Engineering

Configure [PingOne](https://www.pingidentity.com/en/platform/capabilities/single-sign-on.html) — Ping Identity's cloud-based identity platform — as a SAML 2.0 Identity Provider into Ory Polis. Common in regulated industries (financial services, healthcare, government) where Ping's compliance posture and governance features matter.

**Type:** config (Polis SAML connection — no webhook code)
**Docs page:** [ory.com/docs/polis/sso-providers/pingone](https://www.ory.com/docs/polis/sso-providers/pingone)

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/polis/sso-providers/pingone). Short version:

1. In the **PingOne Admin Console** → **Connections** → **Applications** → **+** → **Add Application** → choose **Web App** → **SAML**.
2. Configure the SAML application with values from your Ory Network organization's setup-link:
   - **ACS URL** and **Entity ID**.
3. Configure **Attribute Mapping**: `email`, `firstName`, `lastName`. Add a Group attribute mapping if you map them.
4. Assign user / group **Access** to the application.
5. Download the **Configuration** (Federation Metadata XML) and paste into Ory.

## Notes

- PingOne's policy engine (per-app risk + MFA + device posture) sits at the IdP layer; resulting authenticated assertion flows through to Ory unchanged.
- Don't confuse PingOne (the cloud platform) with PingFederate (on-prem) — both speak SAML, but configuration paths differ. This entry covers PingOne; PingFederate would configure as a generic SAML SP.
- Following the 2023 ForgeRock acquisition, Ping Identity now owns both — see [`enterprise-sso/forgerock-am`](../forgerock-am/) for the legacy on-prem product.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
