# YubiKey (WebAuthn/FIDO2) Integration with Ory Network

## Overview

YubiKey is a hardware security key manufactured by Yubico that supports WebAuthn/FIDO2, FIDO U2F, and other authentication protocols. Ory Network natively supports WebAuthn/FIDO2 for multi-factor authentication (MFA), allowing users to register YubiKeys and other FIDO2-compliant authenticators as second factors. This enables phishing-resistant authentication at AAL2 (Authenticator Assurance Level 2).

Key integration capabilities:
- WebAuthn/FIDO2 registration and authentication flows
- Hardware-based second factor (AAL2) enforcement
- Phishing-resistant authentication (origin-bound credentials)
- Support for YubiKey 5 series, Security Key series, and Bio series
- Compatible with other FIDO2 authenticators (Windows Hello, Touch ID, Android biometrics)

Ory documentation: https://www.ory.sh/docs/kratos/mfa/webauthn-fido-yubikey

## Integration Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│              │    │              │    │              │
│   User       │─1─▶│  Browser     │─2─▶│  Ory Kratos  │
│   + YubiKey  │    │  WebAuthn    │    │  WebAuthn    │
│              │    │  API         │    │  Endpoint    │
│              │◀─5─│              │◀─3─│              │
└──────────────┘    └──────┬───────┘    └──────────────┘
                           │
                           4 (user touches YubiKey)
                           │
                    ┌──────▼───────┐
                    │  YubiKey     │
                    │  (FIDO2      │
                    │  Credential) │
                    └──────────────┘

Registration Flow:
1. User initiates MFA setup in settings
2. Browser calls navigator.credentials.create() with Ory challenge
3. Ory returns PublicKeyCredentialCreationOptions
4. User inserts YubiKey and touches it; browser generates credential
5. Credential registered with Ory; user now has AAL2 capability

Authentication Flow:
1. User logs in with password (AAL1)
2. Ory requests second factor; browser calls navigator.credentials.get()
3. Ory returns PublicKeyCredentialRequestOptions
4. User inserts YubiKey and touches it; browser signs challenge
5. Ory validates signature; session upgraded to AAL2
```

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management. Handles WebAuthn credential registration, storage, and verification. Manages AAL levels. |
| **Ory Network** | Hosts the WebAuthn relying party configuration. |

## Prerequisites

- **Ory Network Account**: An active Ory Network project
- **YubiKey**: A FIDO2-compatible YubiKey (5 series, Security Key series, or Bio series)
- **HTTPS Domain**: WebAuthn requires a secure origin (HTTPS)
- **Modern Browser**: Chrome, Firefox, Safari, or Edge with WebAuthn support

## Configuration

### Step 1: Enable WebAuthn in Ory Network

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/methods/webauthn/enabled=true' \
  --add '/selfservice/methods/webauthn/config/rp/display_name="Your Application"' \
  --add '/selfservice/methods/webauthn/config/rp/id="example.com"' \
  --add '/selfservice/methods/webauthn/config/rp/origins=["https://example.com","https://app.example.com"]' \
  --add '/selfservice/methods/webauthn/config/passwordless=false'
```

Configuration parameters:
- `rp.id` — The Relying Party ID. Must be the domain (or registrable domain suffix) of your application. For example, `example.com` allows credentials from `app.example.com` and `example.com`.
- `rp.origins` — Allowed origins for WebAuthn ceremonies. Must include the full origin (scheme + host + optional port).
- `passwordless` — Set to `false` for MFA mode (second factor). Set to `true` to allow passwordless primary authentication with YubiKey.

### Step 2: Enforce AAL2 for Protected Resources

To require MFA (including YubiKey) for session access:

```bash
ory patch identity-config --project <project-id> \
  --add '/session/whoami/required_aal="aal2"'
```

Or enforce AAL2 only for specific actions:

```bash
ory patch identity-config --project <project-id> \
  --add '/selfservice/flows/settings/required_aal="aal2"'
```

### Step 3: Implement WebAuthn Registration UI

```html
<html>
<head><title>Register YubiKey</title></head>
<body>
  <h2>Register Your YubiKey</h2>
  <button id="register-btn">Register YubiKey</button>
  <div id="status"></div>

  <script>
    const ORY_SDK_URL = "https://<your-project>.projects.oryapis.com";

    document.getElementById("register-btn").addEventListener("click", async () => {
      const statusEl = document.getElementById("status");
      statusEl.textContent = "Starting registration...";

      try {
        // 1. Initialize settings flow
        const flowRes = await fetch(`${ORY_SDK_URL}/self-service/settings/browser`, {
          credentials: "include",
          redirect: "follow",
        });
        const flow = await flowRes.json();

        // 2. Find the WebAuthn node with the creation options
        const webauthnNode = flow.ui.nodes.find(
          (n) => n.attributes.name === "webauthn_register_trigger"
        );

        if (!webauthnNode) {
          statusEl.textContent = "WebAuthn not available in this flow.";
          return;
        }

        // 3. Parse the PublicKeyCredentialCreationOptions from the flow
        const optionsNode = flow.ui.nodes.find(
          (n) => n.attributes.name === "webauthn_register"
        );
        const creationOptions = JSON.parse(optionsNode.attributes.value);

        // 4. Convert base64url strings to ArrayBuffers
        creationOptions.publicKey.challenge = base64urlToBuffer(
          creationOptions.publicKey.challenge
        );
        creationOptions.publicKey.user.id = base64urlToBuffer(
          creationOptions.publicKey.user.id
        );
        if (creationOptions.publicKey.excludeCredentials) {
          creationOptions.publicKey.excludeCredentials =
            creationOptions.publicKey.excludeCredentials.map((c) => ({
              ...c,
              id: base64urlToBuffer(c.id),
            }));
        }

        statusEl.textContent = "Touch your YubiKey...";

        // 5. Call WebAuthn API — user touches YubiKey here
        const credential = await navigator.credentials.create(creationOptions);

        // 6. Encode the credential response
        const credentialData = {
          id: credential.id,
          rawId: bufferToBase64url(credential.rawId),
          type: credential.type,
          response: {
            attestationObject: bufferToBase64url(
              credential.response.attestationObject
            ),
            clientDataJSON: bufferToBase64url(
              credential.response.clientDataJSON
            ),
          },
        };

        // 7. Submit to Ory
        const submitRes = await fetch(
          `${ORY_SDK_URL}/self-service/settings?flow=${flow.id}`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              method: "webauthn",
              webauthn_register: JSON.stringify(credentialData),
              webauthn_register_displayname: "YubiKey",
            }),
          }
        );

        if (submitRes.ok) {
          statusEl.textContent = "YubiKey registered successfully.";
        } else {
          const err = await submitRes.json();
          statusEl.textContent = "Registration failed: " + JSON.stringify(err.ui?.messages);
        }
      } catch (err) {
        statusEl.textContent = "Error: " + err.message;
      }
    });

    function base64urlToBuffer(base64url) {
      const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }

    function bufferToBase64url(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    }
  </script>
</body>
</html>
```

### Step 4: WebAuthn Authentication Flow

When AAL2 is required, Ory automatically prompts for the second factor:

```javascript
// Check if AAL2 is needed
const session = await fetch(`${ORY_SDK_URL}/sessions/whoami`, {
  credentials: "include",
});
const sessionData = await session.json();

if (sessionData.authenticator_assurance_level === "aal1") {
  // Redirect to login flow for AAL2 step-up
  window.location.href = `${ORY_SDK_URL}/self-service/login/browser?aal=aal2`;
}
```

## YubiKey Models and Compatibility

| Model | FIDO2 | NFC | USB-A | USB-C | Lightning | Biometric |
|-------|-------|-----|-------|-------|-----------|-----------|
| YubiKey 5 NFC | Yes | Yes | Yes | - | - | - |
| YubiKey 5C NFC | Yes | Yes | - | Yes | - | - |
| YubiKey 5Ci | Yes | - | - | Yes | Yes | - |
| YubiKey 5 Nano | Yes | - | Yes | - | - | - |
| YubiKey 5C Nano | Yes | - | - | Yes | - | - |
| Security Key NFC | Yes | Yes | Yes | - | - | - |
| YubiKey Bio | Yes | - | Yes | Yes | - | Yes |

## AAL Enforcement Matrix

| Scenario | AAL1 (Password) | AAL2 (+ YubiKey) | Configuration |
|----------|-----------------|-------------------|---------------|
| Public pages | Not required | Not required | No session check |
| General app access | Required | Optional | Default behavior |
| Account settings | Required | Required | `settings.required_aal = "aal2"` |
| All authenticated access | Required | Required | `session.whoami.required_aal = "aal2"` |
| Admin actions | Required | Required | Application-level check on `session.authenticator_assurance_level` |

## Testing

### 1. Register YubiKey

1. Log in to your application
2. Navigate to security settings
3. Click "Register YubiKey"
4. Insert YubiKey and touch the sensor
5. Verify registration success

### 2. Test AAL2 Authentication

```bash
# Check session AAL level
curl -s -b cookies.txt \
  "$ORY_SDK_URL/sessions/whoami" | jq '.authenticator_assurance_level'
```

### 3. Verify Credential Storage

```bash
ory get identity <identity-id> --project <project-id> --format json | \
  jq '.credentials.webauthn'
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **"Not allowed" error** | RP ID mismatch | Verify `rp.id` matches your domain; cannot use IP addresses |
| **YubiKey not detected** | Browser or driver issue | Try a different USB port; update browser; check WebAuthn support |
| **"Origin not allowed"** | Origin not in `rp.origins` list | Add the full origin (including port for dev) to the origins config |
| **Credential already registered** | Same YubiKey registered twice | YubiKey slots are unique per RP; check `excludeCredentials` |
| **AAL2 not enforced** | `required_aal` not set | Configure `session.whoami.required_aal` or application-level checks |
| **NFC not working on mobile** | Browser NFC WebAuthn support | Chrome on Android supports NFC; Safari on iOS 16.4+ supports it |

## Resources

- [Ory WebAuthn/FIDO2/YubiKey Documentation](https://www.ory.sh/docs/kratos/mfa/webauthn-fido-yubikey)
- [Ory MFA Overview](https://www.ory.sh/docs/kratos/mfa/overview)
- [Ory AAL Configuration](https://www.ory.sh/docs/kratos/mfa/step-up-authentication)
- [WebAuthn Guide (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API)
- [FIDO2 Specification](https://fidoalliance.org/fido2/)
- [Yubico Developer Documentation](https://developers.yubico.com/)
- [Can I Use: WebAuthn](https://caniuse.com/webauthn)
