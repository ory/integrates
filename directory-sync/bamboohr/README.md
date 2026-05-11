# BambooHR — Ory Network Integration

> **Maintained by:** Community contributors

## Overview

BambooHR is a popular HRIS for SMB and mid-market companies. This integration enriches Ory identities with employee data from BambooHR via an Ory Actions webhook on login or registration, optionally gating access based on employment status. BambooHR is the source of truth for employment data; Ory remains the source of truth for identity.

## How it works

```
User logs in / registers
        ↓
Ory Action webhook → POST /bamboohr/enrich-user
        ↓
Handler authenticates request (X-Webhook-Secret)
        ↓
Handler calls BambooHR /employees/directory and filters by workEmail
        ↓
Handler calls BambooHR /employees/<id>?fields=status,jobTitle,...
        ↓
Handler returns { employed, employee_id, job_title, department, hire_date }
        ↓
Ory Action: write fields to identity.metadata.public, or fail the
flow when employed=false (off-boarded employees blocked from access)
```

## Prerequisites

- Ory Network project
- BambooHR account
- BambooHR API key — generate at `https://<company>.bamboohr.com/settings/permissions/api.php`
- A deployment target

## Deploy

```bash
cd webhook/
cp .env.example .env
# Fill BAMBOOHR_COMPANY, BAMBOOHR_API_KEY, ORY_WEBHOOK_SECRET
npm install
node server.js
```

Endpoints:

- `GET /health` — readiness check
- `POST /bamboohr/enrich-user` — Ory Action target

## Configure Ory

1. Register the webhook on `after login` (and optionally `after registration`) with [`ory-actions.yaml`](ory-actions.yaml).
2. Body template: [`jsonnet/identity.jsonnet`](jsonnet/identity.jsonnet) — only `email` is required; the rest is enriched server-side.
3. Set `response.parse: true` and `response.ignore: false` if you want Ory to consume the enrichment payload.

## Patterns

- **Off-boarded gate.** If `employed === false` and you require an active employee for access, fail the Ory flow with a 4xx in the action response handling.
- **Role-based attribute mapping.** Map `job_title` or `department` into `metadata.public` and use those in downstream policy (Ory Permissions, Oathkeeper).
- **Hybrid identity.** For SaaS apps where some users are employees and some are customers, use the `employed` flag to branch the post-login experience rather than to gate access entirely.

## Performance note

BambooHR doesn't expose a "lookup by email" endpoint, so the handler scans the directory. For organizations with thousands of employees, swap the directory call for a saved **custom report** with a filter on workEmail — that requires creating a saved report in the BambooHR UI and calling `/reports/<report-id>`. The pattern is documented in BambooHR's API reference.

## Troubleshooting

- **`401` from BambooHR** — confirm Basic auth uses the API key as username and literal `x` as password.
- **No employee match** — BambooHR `workEmail` is case-sensitive on some accounts; the handler lower-cases both sides before comparing.
- **Latency** — large directories make the directory-scan slow. Profile against your real org size before rolling out.

## Resources

- [BambooHR API documentation](https://documentation.bamboohr.com/reference)
- [Ory Actions and webhooks](https://www.ory.com/docs/actions/web-hook)
