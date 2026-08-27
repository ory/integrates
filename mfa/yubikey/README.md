# YubiKey (WebAuthn / FIDO2)

> **Maintained by:** Ory Engineering

YubiKey is a hardware security key from Yubico — supports WebAuthn / FIDO2 / U2F. **Ory Network natively supports WebAuthn / FIDO2 as a multi-factor authentication method**, so YubiKey registration and use is built-in — no integration code required, just enable WebAuthn in your project's MFA configuration.

**Type:** config (Ory Console MFA configuration — no webhook code)
**Docs page:** [ory.com/docs/integrates-with/mfa/yubikey](https://www.ory.com/docs/integrates-with/mfa/yubikey) — full guide: [ory.com/docs/network/kratos/mfa/webauthn-fido-yubikey](https://www.ory.com/docs/network/kratos/mfa/webauthn-fido-yubikey)

## Setup

The full walkthrough lives in the [Ory docs page above](https://www.ory.com/docs/network/kratos/mfa/webauthn-fido-yubikey). Short version:

1. In Ory Console → **Authentication** → **Multi-factor**, enable **WebAuthn**.
2. Configure the **Relying Party (RP)**:
   - `id`: your auth domain (e.g. `auth.example.com`) — the eTLD+1 the WebAuthn credential is scoped to.
   - `origins`: the full origins users sign in from (e.g. `https://app.example.com`).
   - `display_name`: shown to users in the YubiKey enrollment prompt.
3. (Optional) Enable **Passkeys** as a first factor — same WebAuthn mechanism but used as primary credential rather than second factor.
4. Users can register YubiKeys (or other FIDO2 authenticators — TouchID, Windows Hello, etc.) via the Settings flow.

## Notable

- WebAuthn covers more than YubiKey — TouchID, Face ID, Windows Hello, Android biometrics, and any FIDO2-certified authenticator all use the same mechanism. "YubiKey" in the docs page title is historical.
- **Phishing-resistant**: WebAuthn binds the credential to the origin, so a phishing site at `auth-example.com` cannot steal a credential registered for `auth.example.com`.
- **AAL2 / NIST 800-63**: WebAuthn satisfies Authenticator Assurance Level 2; pair with a password-or-passkey first factor to reach AAL2 + IAL2 combined.
- The relying party `id` cannot change after credentials are issued — registered credentials become unusable. Plan the auth domain carefully.

## License

Apache-2.0. (Configuration-only — no source code in this directory.)
