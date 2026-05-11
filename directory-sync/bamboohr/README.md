# BambooHR

> **Maintained by:** Community contributors

[BambooHR](https://bamboohr.com) is an HRIS popular with SMB and mid-market companies. This integration enriches Ory identities with employee data from BambooHR via an Ory Action webhook on login or registration, returning `{ employed, employee_id, job_title, department, hire_date }` so a post-flow Action can gate access on employment status or write the fields into identity metadata.

**Type:** webhook (Ory Action calls a handler during a flow)
**Docs page:** [ory.com/docs/integrations/directory-sync/bamboohr](https://ory.com/docs/integrations/directory-sync/bamboohr)

## Use case

A company runs internal SaaS for employees and wants login to gate on employment status — off-boarded employees automatically lose access without a separate deprovision step. BambooHR is the HRIS source of truth; the integration looks up the user's BambooHR employee record at login and returns the employment flag so Ory can fail the flow on `employed: false`.

## How it works

1. A user logs in (or registers) through an Ory flow.
2. Ory fires the sync Action webhook to this handler. The handler verifies the shared secret.
3. The handler calls `GET /employees/directory` and filters by `workEmail` (BambooHR lacks a direct lookup-by-email API).
4. On match, the handler calls `GET /employees/<id>?fields=status,jobTitle,department,hireDate,terminationDate` and returns `{ employed: status === "Active", employee_id, job_title, department, hire_date }`.
5. On no match, the handler returns `{ employed: false }` so Ory can decide (some companies want to allow non-employee logins; others gate access entirely).

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

1. Configure the Action hook using the snippet in [`ory-actions.yaml`](ory-actions.yaml) — register on `after:login` and optionally `after:registration`.
2. The body template is [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet); only `email` is required.
3. Keep `response.parse: true` and `response.ignore: false` so Ory consumes the enrichment payload.
4. Set `ORY_WEBHOOK_SECRET` in the handler's `.env` to match the `X-Webhook-Secret` value in the hook config.

Off-boarded-employee gating, role-based attribute mapping, and saved-report lookups for large directories: see the [docs page](https://ory.com/docs/integrations/directory-sync/bamboohr).

## Troubleshooting

- **`401 invalid webhook secret`** — `ORY_WEBHOOK_SECRET` in `.env` doesn't match `X-Webhook-Secret` in the Ory hook config.
- **`401` from BambooHR** — Basic auth must use the API key as username and the literal string `x` as password.
- **No employee match for a known user** — `workEmail` in BambooHR doesn't match the Ory identity's email (case mismatch, alias domains, etc.). The handler already lower-cases both sides; check whether the BambooHR record uses `workEmail` or a custom field.
- **Slow responses on large orgs** — the handler scans the full directory because BambooHR has no lookup-by-email. For thousands of employees, swap the directory call for a saved BambooHR **custom report** filtered on workEmail and call `/reports/<report-id>` instead.

## License

Apache-2.0. SPDX header at the top of each source file.
