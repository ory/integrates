# <Integration Name> — Ory Console setup steps

This is the manual setup flow for configuring <integration> in an Ory Network project. The full walkthrough with screenshots lives at [ory.com/docs/integrations/<your-integration>](https://ory.com/docs/integrations/).

## 1. Configure the vendor side

1. <Step in vendor's admin console>
2. <...>
3. Note the values you'll need in step 2:
   - Client ID / API key / endpoint URL / etc.

## 2. (Optional) Configure additional settings

<Use this section if there are optional vendor-side configurations, e.g. claim mappings, group membership, scopes.>

## 3. Configure Ory

1. Open your Ory Network project in the Ory Console.
2. Navigate to <Authentication / Identity / Webhooks> → <relevant section>.
3. Click <Add ...>.
4. Configure:
   - **Field A:** <value or description>
   - **Field B:** <value from step 1>
   - **Field C:** <value from step 1>
5. <If a Jsonnet trait mapping is needed, paste the snippet here>:

   ```jsonnet
   local claims = std.extVar('claims');
   {
     identity: {
       traits: {
         email: claims.email,
       },
     },
   }
   ```

6. Save.

## 4. Test

1. Trigger the relevant flow in your application.
2. Confirm the expected behavior.
3. <Common verification step — e.g., "confirm a new identity is created with the expected traits">.

## Troubleshooting

- **<Common error 1>** — <cause and fix>
- **<Common error 2>** — <cause and fix>
- **Identity created but traits empty** — confirm the Jsonnet claim mapping matches the actual claim names returned by the provider.
