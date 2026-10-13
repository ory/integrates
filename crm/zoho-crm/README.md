# Zoho CRM

> **Maintained by:** Ory Engineering

[Zoho CRM](https://www.zoho.com/crm/) contact sync from Ory Network via Ory Actions webhooks. When a user registers (or updates their profile) in an Ory-powered application, this handler upserts the corresponding Zoho Contact keyed by email.

**Type:** webhook (Ory Action — code in [`webhook/`](./webhook/))
**Docs page:** [ory.com/docs/integrates-with/crm/zoho-crm](https://www.ory.com/docs/integrates-with/crm/zoho-crm)

## Endpoints

| Path | Trigger | Auth | Purpose |
| --- | --- | --- | --- |
| `POST /zoho-crm/sync-user` | async, registration method lists and settings `profile` list | `X-Webhook-Secret` | Exchanges long-lived refresh token for short-lived access token (cached); upserts the Contact record by email via Zoho's bulk upsert endpoint. |

## Required env vars

```
ORY_WEBHOOK_SECRET        X-Webhook-Secret header value Ory sends
ZOHO_CLIENT_ID            Zoho OAuth client id
ZOHO_CLIENT_SECRET        Zoho OAuth client secret
ZOHO_REFRESH_TOKEN        Long-lived refresh token; handler exchanges for access tokens
ZOHO_API_BASE_URL         default: https://www.zohoapis.com/crm/v2 (US)
                          Use https://www.zohoapis.in/crm/v2 (IN) or
                              https://www.zohoapis.eu/crm/v2 (EU)
ZOHO_ACCOUNTS_URL         default: https://accounts.zoho.com
                          Use the region-matching accounts host.
PORT                      default: 3000
```

## Run

```bash
cd webhook/
cp .env.example .env
npm install
npm start              # runs `tsx server.ts`
```

## Configure Ory

1. Use the hooks in [`ory-actions.yaml`](./ory-actions.yaml), with the URL `https://<your-handler>/zoho-crm/sync-user`. Attach them to the method-specific lists, not to the flow-level `after.hooks` lists: `selfservice.flows.registration.after.<method>.hooks` for each sign-up method you enable, such as `password` and `oidc`, and `selfservice.flows.settings.after.profile.hooks`. On Ory Network, the `password` registration list contains `session`; keep it last. See [Attach `after` actions to authentication methods](https://www.ory.com/docs/kratos/hooks/configure-hooks#attach-after-actions-to-authentication-methods).
2. Body template is in [`jsonnet/`](./jsonnet/). Ory Network doesn't accept `file://` bodies, so set `body` to `base64://` followed by the Base64-encoded template.
3. Set `response.ignore: true` so Ory doesn't wait for the handler. Zoho availability then never blocks user flows. Ory still retries a `429` or `5xx` response other than `501`, for up to three attempts in total.

## Notes

- **Multi-region**: Zoho is regional. Match `ZOHO_API_BASE_URL` and `ZOHO_ACCOUNTS_URL` to the data-center your Zoho org lives in (US / IN / EU / AU / JP / CA / CN).
- The upsert matches contacts by email. When a user changes their email address in the settings flow, Zoho creates a new contact instead of updating the old one.
- Access tokens have a 1-hour TTL; the handler caches and refreshes automatically using the refresh token.
- Refresh tokens are **rate-limited** (15 tokens per 7 minutes per org) — don't generate a fresh refresh token per request; reuse the one in env.

## License

Apache-2.0. SPDX header in each source file.
