# BambooHR

> **Maintained by:** Community contributors

[BambooHR](https://bamboohr.com) is an HRIS popular with SMB and mid-market companies. This integration checks employment status in BambooHR from an Ory Action webhook on login or registration, and blocks the flow when the user isn't an active employee.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrates-with/directory-sync/bamboohr](https://www.ory.com/docs/integrates-with/directory-sync/bamboohr)

## Use case

A company runs internal SaaS for employees and wants login to gate on employment status — off-boarded employees automatically lose access without a separate deprovision step. BambooHR is the HRIS source of truth; the integration looks up the user's BambooHR employee record at login and blocks the sign-in when there is no active record.

## How it works

1. A user logs in (or registers) through an Ory flow.
2. Ory fires the sync Action webhook to this handler. The handler verifies the shared secret.
3. The handler calls `GET /employees/directory` and filters by `workEmail` (BambooHR lacks a direct lookup-by-email API).
4. On match, the handler calls `GET /employees/<id>?fields=status,jobTitle,department,hireDate,terminationDate`. An `Active` employee gets `204 No Content`, and the flow continues.
5. On no match or a non-`Active` status, the handler responds with `403` and a [`messages` body](https://www.ory.com/docs/kratos/hooks/configure-hooks#webhook-responses), so Ory stops the flow and shows the user why. A `200` response doesn't block anything, whatever its body says.
6. If BambooHR is slow or unreachable, the handler responds with `502`, and Ory fails the flow. This check makes every sign-in depend on BambooHR, so decide whether to keep that fail-closed behavior or let users in when BambooHR can't answer.

## Prerequisites

- An Ory Network project.
- A BambooHR account and an API key (generate at `https://<company>.bamboohr.com/settings/permissions/api.php`).
- A deployment target for the webhook handler.

## Deploy the webhook handler

```bash
cd webhook/
cp .env.example .env
# Fill ORY_WEBHOOK_SECRET, BAMBOOHR_COMPANY, BAMBOOHR_API_KEY.
npm install
npm start
```

The server listens on the port specified in `.env` (default 3000) and exposes:

- `GET /health` — readiness check.
- `POST /bamboohr/enrich-user` — Ory Action target.

## Configure Ory

1. Configure the Action hook using the snippet in [`ory-actions.yaml`](ory-actions.yaml). Add it to the login method lists, for example `selfservice.flows.login.after.password.hooks`, and optionally the registration method lists. Ory runs the global `selfservice.flows.login.after.hooks` list only for a method that has no hooks of its own.
2. The body template is [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet); only `email` is required.
3. Keep `response.parse: true` and `response.ignore: false` so Ory reads the `messages` body of a `403` and shows it to the user.
4. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value in the hook config.

Off-boarded-employee gating, role-based attribute mapping, and saved-report lookups for large directories: see the [docs page](https://ory.com/docs/integrates-with/directory-sync/bamboohr).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match `X-Webhook-Secret` in the Ory hook config.
- **`401` from BambooHR** — Basic auth must use the API key as username and the literal string `x` as password.
- **No employee match for a known user** — `workEmail` in BambooHR doesn't match the Ory identity's email (case mismatch, alias domains, etc.). The handler already lower-cases both sides; check whether the BambooHR record uses `workEmail` or a custom field.
- **Slow responses on large orgs** — the handler scans the full directory because BambooHR has no lookup-by-email. For thousands of employees, swap the directory call for a saved BambooHR **custom report** filtered on workEmail and call `/reports/<report-id>` instead.

## License

Apache-2.0. SPDX header at the top of each source file.
