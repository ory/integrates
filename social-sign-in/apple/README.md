# Sign in with Apple - Ory Network Integration

## Overview

Sign in with Apple allows users to authenticate using their Apple ID. Apple provides a privacy-focused authentication experience with features like private email relay (Hide My Email), which generates unique, random email addresses that forward to the user's real email. Integrating Apple with Ory Network is **mandatory for iOS apps that offer any third-party social login** per Apple App Store guidelines.

## Integration Architecture

```
User Browser / iOS App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy - "apple" provider)
       |
       v
  Apple Authorization Endpoint
  (https://appleid.apple.com/auth/authorize)
       |
       v
  Apple Token Endpoint
  (https://appleid.apple.com/auth/token)
       |
       v
  Apple ID Token (JWT) — contains user claims
       |
       v
  Ory Kratos creates/updates identity
       |
       v
  User redirected to application
```

**Key Differences from Standard OAuth:**

- Apple uses **client secret JWTs** signed with a private key instead of static client secrets.
- User name is **only provided on the first authorization** — it must be captured immediately.
- Apple supports **private email relay** — users may choose to hide their real email.
- Apple returns claims in the **ID token**, not via a userinfo endpoint.

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management, built-in Apple OIDC provider support |
| **Ory Network** | Managed cloud hosting for Kratos with Apple provider preset |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **Apple Developer Account** — Requires an active [Apple Developer Program](https://developer.apple.com/programs/) membership ($99/year).
3. **App ID** — Register an App ID with "Sign in with Apple" capability enabled in [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list).
4. **Services ID** — Create a Services ID for web authentication:
   - This acts as the **Client ID** (e.g., `com.example.app.signin`).
   - Configure the **Return URL** (callback):
     ```
     https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/apple
     ```
5. **Private Key** — Create a private key with "Sign in with Apple" enabled:
   - Download the `.p8` key file (you can only download it once).
   - Note the **Key ID**.
6. **Team ID** — Found in your Apple Developer account membership details.

## Configuration

### Using the Ory CLI

1. **Create a Jsonnet claims mapper** (save as `apple-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         name: {
           [if 'given_name' in claims then 'first' else null]: claims.given_name,
           [if 'family_name' in claims then 'last' else null]: claims.family_name,
         },
       },
     },
   }
   ```

2. **Encode your Apple private key** (the `.p8` file contents):
   ```bash
   APPLE_PRIVATE_KEY=$(cat AuthKey_XXXXXXXXXX.p8 | base64)
   ```

3. **Add Apple as a social sign-in provider:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={
       "id": "apple",
       "provider": "apple",
       "client_id": "<your-services-id>",
       "apple_team_id": "<your-team-id>",
       "apple_private_key_id": "<your-key-id>",
       "apple_private_key": "<base64-encoded-p8-key>",
       "scope": ["name", "email"],
       "mapper_url": "base64://'"$(base64 < apple-mapper.jsonnet)"'"
     }'
   ```

4. **Enable the OIDC method** (if not already):
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/enabled=true'
   ```

### Using the Ory Console

1. Navigate to **Authentication > Social Sign-In** in the [Ory Console](https://console.ory.sh).
2. Click **Add Provider** and select **Apple**.
3. Fill in:
   - **Services ID:** Your Apple Services ID (Client ID)
   - **Team ID:** Your Apple Developer Team ID
   - **Private Key ID:** The Key ID for your `.p8` key
   - **Private Key:** Paste the contents of your `.p8` file
   - **Scopes:** `name`, `email`
4. Upload or paste your Jsonnet mapper.
5. Click **Save**.

## Technical Details

### OIDC Configuration

| Parameter | Value |
|-----------|-------|
| Provider Type | `apple` (native support) |
| Issuer URL | `https://appleid.apple.com` |
| Authorization URL | `https://appleid.apple.com/auth/authorize` |
| Token URL | `https://appleid.apple.com/auth/token` |
| JWKS URL | `https://appleid.apple.com/auth/keys` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `name` | User's first and last name (only on first sign-in) |
| `email` | User's email or private relay email |

### Claims from Apple ID Token

| Claim | Description | Notes |
|-------|-------------|-------|
| `sub` | Unique, stable user identifier | Always available |
| `email` | Email address | May be a private relay address |
| `email_verified` | Whether email is verified | Always `true` for Apple |
| `is_private_email` | Whether using private relay | `true` or `false` |
| `given_name` | First name | **Only on first authorization** |
| `family_name` | Last name | **Only on first authorization** |

### Important Considerations

- **Name is only sent once:** Apple only sends `given_name` and `family_name` during the user's first authorization. Ory Kratos handles this by storing these values from the initial request.
- **Private email relay:** Users can choose "Hide My Email," which generates an address like `abc123@privaterelay.appleid.com`. Your app must register domains/emails with Apple to send to these relay addresses.
- **Client secret rotation:** Apple client secrets (JWTs) expire after 6 months maximum. Ory Network handles the JWT generation and rotation automatically when you provide the private key.
- **Form POST response:** Apple sends the authorization response as a form POST, not a query parameter redirect. Ory Kratos handles this natively with the `apple` provider type.

## Example Identity Schema

### Ory Identity Schema (`identity.schema.json`)

```json
{
  "$id": "https://example.com/identity.schema.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Identity",
  "type": "object",
  "properties": {
    "traits": {
      "type": "object",
      "properties": {
        "email": {
          "type": "string",
          "format": "email",
          "title": "Email",
          "ory.sh/kratos": {
            "credentials": {
              "password": { "identifier": true }
            },
            "verification": { "via": "email" }
          }
        },
        "name": {
          "type": "object",
          "properties": {
            "first": { "type": "string", "title": "First Name" },
            "last": { "type": "string", "title": "Last Name" }
          }
        }
      },
      "required": ["email"]
    }
  }
}
```

### Jsonnet Claims Mapper (`apple-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      name: {
        [if 'given_name' in claims then 'first' else null]: claims.given_name,
        [if 'family_name' in claims then 'last' else null]: claims.family_name,
      },
    },
  },
}
```

## Testing

1. **Start a login flow:**
   ```bash
   open "https://{your-project-slug}.projects.oryapis.com/self-service/login/browser"
   ```

2. **Click "Sign in with Apple"** and authenticate with an Apple ID.

3. **Test the private email relay:**
   - During sign-in, choose "Hide My Email."
   - Verify that the identity is created with a `@privaterelay.appleid.com` address.

4. **Verify the identity:**
   ```bash
   ory list identities \
     --project <your-project-id> \
     --workspace <your-workspace-id>

   ory get identity <identity-id> \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --format json
   ```

5. **Test on iOS:**
   - Use the native Apple Sign-In button with ASAuthorizationAppleIDProvider.
   - Pass the authorization code and ID token to your Ory-backed API.

6. **Test edge cases:**
   - First-time sign-in (name should be captured).
   - Subsequent sign-in (name will not be in the token; should still work).
   - Revoke access in Apple ID settings > Security > Sign in with Apple.

## Resources

- [Ory Kratos Apple Sign-In Documentation](https://www.ory.sh/docs/kratos/social-signin/apple)
- [Apple Sign in with Apple Documentation](https://developer.apple.com/sign-in-with-apple/)
- [Apple REST API Reference](https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_rest_api)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple)
- [Apple Private Email Relay Service](https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_js/communicating_using_the_private_email_relay_service)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
