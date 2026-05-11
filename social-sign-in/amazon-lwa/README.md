# Login with Amazon (LWA) - Ory Network Integration

## Overview

Login with Amazon (LWA) allows users to authenticate using their Amazon account credentials. Integrating LWA with Ory Network provides a seamless sign-in experience for consumer-facing applications, particularly those in the e-commerce space. Amazon has hundreds of millions of active customer accounts, making it a valuable authentication option for retail, marketplace, and consumer applications.

## Integration Architecture

```
User Browser/App
       |
       v
  Ory Self-Service Login UI
       |
       v
  Ory Kratos (OIDC Strategy)
       |
       v
  Amazon OAuth 2.0 Authorization Server
  (https://www.amazon.com/ap/oa)
       |
       v
  Amazon Token Endpoint
  (https://api.amazon.com/auth/o2/token)
       |
       v
  Amazon Profile API
  (https://api.amazon.com/user/profile)
       |
       v
  Ory Kratos creates/updates identity
       |
       v
  User redirected to application
```

**Data Flow:**

1. User clicks "Login with Amazon" on your application's login page.
2. Ory Kratos redirects the user to Amazon's OAuth 2.0 authorization endpoint.
3. User authenticates with Amazon and grants consent.
4. Amazon redirects back to Ory Kratos with an authorization code.
5. Kratos exchanges the code for an access token.
6. Kratos fetches user profile data from the Amazon Profile API.
7. Kratos creates or updates the identity using the configured Jsonnet mapper.
8. User is redirected back to your application, authenticated.

## Ory Products

| Product | Role |
|---------|------|
| **Ory Kratos** | Identity management, OIDC/OAuth2 social sign-in strategy |
| **Ory Network** | Managed cloud hosting for Kratos |

## Prerequisites

1. **Ory Network Account** — Sign up at [console.ory.sh](https://console.ory.sh).
2. **Amazon Developer Account** — Register at [developer.amazon.com](https://developer.amazon.com).
3. **Login with Amazon Security Profile** — Create a security profile in the Amazon Developer Console:
   - Go to **Apps & Services > Login with Amazon**.
   - Click **Create a New Security Profile**.
   - Fill in the Security Profile Name, Description, and Privacy Notice URL.
   - Note the **Client ID** and **Client Secret**.
4. **Configure Allowed Return URLs** — In the LWA security profile settings under **Web Settings**, add your Ory Network callback URL:
   ```
   https://{your-project-slug}.projects.oryapis.com/self-service/methods/oidc/callback/amazon
   ```

## Configuration

### Using the Ory CLI

1. **Download and install the Ory CLI:**
   ```bash
   # macOS
   brew install ory/tap/cli

   # Linux
   bash <(curl https://raw.githubusercontent.com/ory/meta/master/install.sh) -b . ory
   ```

2. **Create a Jsonnet claims mapper** (save as `amazon-lwa-mapper.jsonnet`):
   ```jsonnet
   local claims = std.extVar('claims');

   {
     identity: {
       traits: {
         [if 'email' in claims then 'email' else null]: claims.email,
         [if 'name' in claims then 'name' else null]: {
           full: claims.name,
         },
       },
     },
   }
   ```

3. **Update your Ory Network identity configuration:**
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/config/providers/-={"id":"amazon","provider":"generic","client_id":"<your-amazon-client-id>","client_secret":"<your-amazon-client-secret>","authorization_url":"https://www.amazon.com/ap/oa","token_url":"https://api.amazon.com/auth/o2/token","issuer_url":"https://www.amazon.com","scope":["profile","postal_code"],"mapper_url":"base64://'$(base64 < amazon-lwa-mapper.jsonnet)'"}'
   ```

4. **Enable the OIDC method** (if not already enabled):
   ```bash
   ory patch identity-config \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --add '/selfservice/methods/oidc/enabled=true'
   ```

### Using the Ory Console

1. Navigate to **Authentication > Social Sign-In** in the [Ory Console](https://console.ory.sh).
2. Click **Add Provider**.
3. Select **Generic Provider** (Amazon is not a preset).
4. Fill in:
   - **Provider ID:** `amazon`
   - **Client ID:** Your Amazon Client ID
   - **Client Secret:** Your Amazon Client Secret
   - **Authorization URL:** `https://www.amazon.com/ap/oa`
   - **Token URL:** `https://api.amazon.com/auth/o2/token`
   - **Scopes:** `profile`, `postal_code`
5. Upload or paste your Jsonnet mapper.
6. Click **Save**.

## Technical Details

### OAuth 2.0 Configuration

| Parameter | Value |
|-----------|-------|
| Provider Type | `generic` (OAuth 2.0) |
| Authorization URL | `https://www.amazon.com/ap/oa` |
| Token URL | `https://api.amazon.com/auth/o2/token` |
| User Info URL | `https://api.amazon.com/user/profile` |
| Scopes | `profile`, `postal_code` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `profile` | User's name, email, and Amazon user ID |
| `postal_code` | User's postal/ZIP code |

### Claims Mapping

Amazon's `/user/profile` endpoint returns:

| Amazon Claim | Description | Example |
|-------------|-------------|---------|
| `user_id` | Unique Amazon user ID | `amzn1.account.AEHZ...` |
| `email` | User's email address | `user@example.com` |
| `name` | User's full name | `Jane Doe` |
| `postal_code` | ZIP/postal code | `98101` |

### Identity Schema Considerations

- Amazon does not return separate first/last name fields; only a single `name` field.
- The `user_id` is the stable unique identifier for the Amazon account.
- Email addresses from Amazon are verified.
- The `postal_code` scope is optional but useful for e-commerce localization.

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
            "full": { "type": "string", "title": "Full Name" }
          }
        }
      },
      "required": ["email"]
    }
  }
}
```

### Jsonnet Claims Mapper (`amazon-lwa-mapper.jsonnet`)

```jsonnet
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      [if 'email' in claims then 'email' else null]: claims.email,
      [if 'name' in claims then 'name' else null]: {
        full: claims.name,
      },
    },
  },
}
```

## Testing

1. **Start a login flow:**
   ```bash
   # Open in browser
   open "https://{your-project-slug}.projects.oryapis.com/self-service/login/browser"
   ```

2. **Verify the Amazon provider appears** in your login UI.

3. **Complete the login flow** by clicking the Amazon button and authenticating with an Amazon account.

4. **Check the created identity:**
   ```bash
   ory list identities \
     --project <your-project-id> \
     --workspace <your-workspace-id>
   ```

5. **Inspect the identity details:**
   ```bash
   ory get identity <identity-id> \
     --project <your-project-id> \
     --workspace <your-workspace-id> \
     --format json
   ```

6. **Verify traits mapping** — confirm that `email` and `name.full` are populated from the Amazon profile.

7. **Test edge cases:**
   - Sign in with a new Amazon account (should create a new identity).
   - Sign in with an existing Amazon account (should link to existing identity if email matches).
   - Revoke access in Amazon account settings and re-authenticate.

## Resources

- [Amazon Login with Amazon Documentation](https://developer.amazon.com/docs/login-with-amazon/web-docs.html)
- [Amazon OAuth 2.0 Authorization Framework](https://developer.amazon.com/docs/login-with-amazon/authorization-code-grant.html)
- [Amazon Customer Profile API](https://developer.amazon.com/docs/login-with-amazon/obtain-customer-profile.html)
- [Ory Kratos Social Sign-In Documentation](https://www.ory.sh/docs/kratos/social-signin/overview)
- [Ory Kratos Generic OIDC/OAuth2 Provider](https://www.ory.sh/docs/kratos/social-signin/generic)
- [Ory CLI Reference](https://www.ory.sh/docs/cli/ory)
