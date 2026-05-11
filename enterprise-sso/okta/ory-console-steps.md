# Okta — Ory Console setup steps

This is the manual setup flow for adding Okta as an OIDC social-signin provider to an Ory Network project. The full walkthrough with screenshots lives at [ory.com/docs/integrations/okta](https://ory.com/docs/integrations/okta).

## 1. Create the Okta application

1. Sign in to your Okta admin console.
2. Navigate to **Applications → Applications** and click **Create App Integration**.
3. Choose:
   - **Sign-in method:** OIDC - OpenID Connect
   - **Application type:** Web Application
4. Click **Next**.
5. Configure:
   - **App integration name:** `Ory Network` (or whatever you prefer)
   - **Grant type:** Authorization Code (default)
   - **Sign-in redirect URI:** `https://<your-ory-project>.projects.oryapis.com/self-service/methods/oidc/callback/okta`
   - **Sign-out redirect URI:** the URL of your application's logout page
   - **Controlled access:** assign to the Okta groups that should be allowed to sign in
6. Click **Save**.
7. From the **General** tab, copy the **Client ID** and the **Client Secret** — you need these in step 3.
8. From the **Sign On** tab (or your Okta admin URL), note the **Issuer URI** — typically `https://<your-okta-domain>/oauth2/default`.

## 2. (Optional) Configure claims

By default Okta returns `sub`, `email`, `name`, and `picture` in the `profile` and `email` scopes. If you need additional claims (custom attributes, group membership), configure them in **Security → API → Authorization Servers → default → Claims**.

## 3. Configure the provider in the Ory Console

1. Open your Ory Network project in the Ory Console.
2. Navigate to **Authentication → Social Sign-In**.
3. Click **Add Social Sign-In Provider**.
4. Configure:
   - **Provider:** `generic`
   - **Provider ID:** `okta` (this becomes the URL slug; use the same value in the Okta redirect URI)
   - **Issuer URL:** the Issuer URI from step 1.8
   - **Client ID:** from step 1.7
   - **Client Secret:** from step 1.7
   - **Scopes:** `openid email profile`
5. Map claims to identity traits using the data mapping configuration. A common mapping:

   ```jsonnet
   local claims = {
     email_verified: false,
   } + std.extVar('claims');

   {
     identity: {
       traits: {
         email: claims.email,
         name: {
           first: claims.given_name,
           last: claims.family_name,
         },
       },
     },
   }
   ```

6. Click **Save**.

## 4. Test

1. Visit your application's sign-in page.
2. Click the new Okta sign-in button.
3. Complete the Okta authentication flow.
4. Confirm a new identity is created in the Ory Console with the expected traits populated from Okta's claims.

## Troubleshooting

- **`invalid_redirect_uri`** — the redirect URI configured in Okta does not exactly match the value Ory sends. Double-check for trailing slashes and the `<provider-id>` slug.
- **Identity created but traits empty** — confirm the Jsonnet claim mapping matches the actual claim names returned by Okta. Use the Ory Console identity inspector to view raw claims.
- **`access_denied` after Okta sign-in** — the Okta user is not assigned to the application. Check **Applications → Ory Network → Assignments**.
