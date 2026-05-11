# Workday SCIM — Ory Network Integration

> **Maintained by:** Ory Engineering

## Overview

Workday is one of the most widely deployed enterprise HCM systems, and acts as the source of truth for employee data in HR-driven access flows. Workday emits SCIM v2.0 to downstream systems, which Ory Network can consume to provision, update, and deprovision identities automatically as employees are hired, change roles, or leave. This pattern keeps Ory's identity store in lock-step with HR ground truth without bespoke integration code.

## How it works

```
Workday Studio / Connector → SCIM v2.0 POST/PUT/PATCH/DELETE → Ory SCIM endpoint
                                                                      ↓
                                                              Ory creates / updates / deletes identity
```

Workday is the SCIM **client**; Ory exposes the SCIM **server endpoint**. Workday is configured with a base URL, an OAuth 2.0 client credential, and the schema mapping; Workday then pushes the events on its own schedule.

## Prerequisites

1. **Ory Network account** with the SCIM endpoint enabled (Authentication → Directory Sync).
2. **Workday tenant** with permission to create an Integration System User (ISU) and Integration System Security Group (ISSG).
3. **Workday Studio** (or Workday Extend) for the SCIM connector. SCIM v2.0 is not turnkey out of the box — Workday delivers it via Studio integrations or a partner-built connector.

## Configuration

### Step 1 — Create the SCIM endpoint in Ory

In the Ory Console, navigate to **Authentication → Directory Sync → SCIM** and create a new directory. Note:
- The SCIM **base URL** (something like `https://{your-project-slug}.projects.oryapis.com/admin/scim/v2`).
- The OAuth 2.0 **client ID** and **client secret** Ory issues to authenticate the Workday connector.

### Step 2 — Create the ISU and ISSG in Workday

Create an Integration System User dedicated to this integration with **Get** and **Put** permissions on the worker domain. Restrict to the population scope you want to sync.

### Step 3 — Build the SCIM connector in Workday Studio

Map Workday worker fields to SCIM 2.0 user attributes:

| SCIM attribute | Workday source |
|---|---|
| `userName` | `Workday_Account` or `Primary_Work_Email` |
| `name.givenName` | `First_Name` |
| `name.familyName` | `Last_Name` |
| `emails[primary=true].value` | `Primary_Work_Email` |
| `active` | `Active_Status` (Hired = `true`, Terminated = `false`) |

Configure the connector to authenticate to Ory's SCIM endpoint with the OAuth 2.0 client-credential grant.

### Step 4 — Schedule the integration

Workday Studio integrations run on a Workday-side schedule (typically every 15 minutes for HR sync). Pick a cadence that matches your access-revocation SLA — termination events should propagate within minutes, not hours.

## Notes

- Workday does not push real-time events on every worker change; the SCIM connector polls and emits changes on its schedule. If you need real-time termination, layer a Workday business-process webhook on top of the SCIM sync.
- Workday's standard pattern is **outbound** SCIM (Workday → Ory). Inbound SCIM (writing to Workday from Ory) is rarely useful for IAM and not covered here.
- Custom Workday tenants vary widely in field naming. Always validate the attribute mapping against the actual tenant schema, not Workday's reference schema.

## Resources

- [Workday SCIM overview (Workday Community, login required)](https://community.workday.com/)
- [Ory SCIM directory sync docs](https://www.ory.com/docs/kratos/manage-identities/scim/okta) (the Okta page is the canonical SCIM walkthrough)
- [SCIM v2.0 RFC 7644](https://datatracker.ietf.org/doc/html/rfc7644)
