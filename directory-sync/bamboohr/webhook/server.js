// SPDX-License-Identifier: Apache-2.0
//
// Reference webhook handler for the Ory ↔ BambooHR integration.
// Looks up the BambooHR employee matching an Ory identity's email and returns
// the relevant employment fields back to Ory so it can decide whether to allow
// the flow to continue.

const express = require("express");
const crypto = require("crypto");
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const BAMBOOHR_COMPANY = process.env.BAMBOOHR_COMPANY;
const BAMBOOHR_API_KEY = process.env.BAMBOOHR_API_KEY;

if (!ORY_WEBHOOK_SECRET || !BAMBOOHR_COMPANY || !BAMBOOHR_API_KEY) {
  console.error("ORY_WEBHOOK_SECRET, BAMBOOHR_COMPANY, BAMBOOHR_API_KEY must be set in .env");
  process.exit(1);
}

const BAMBOO_BASE = `https://api.bamboohr.com/api/gateway.php/${BAMBOOHR_COMPANY}/v1`;
// BambooHR Basic auth: username = API key, password = literal "x".
const BAMBOO_AUTH = `Basic ${Buffer.from(`${BAMBOOHR_API_KEY}:x`).toString("base64")}`;

const app = express();
app.use(express.json());

function verifyWebhookSecret(req, res, next) {
  const provided = req.header("x-webhook-secret") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(ORY_WEBHOOK_SECRET);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "invalid webhook secret" });
  }
  return next();
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/bamboohr/enrich-user", verifyWebhookSecret, async (req, res) => {
  const { identity_id, email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  try {
    // BambooHR doesn't support direct lookup by email, so fetch the directory and
    // filter by workEmail. For very large directories, swap to /reports/custom with
    // a saved report to avoid the full-scan cost.
    const dirRes = await fetch(`${BAMBOO_BASE}/employees/directory`, {
      headers: { authorization: BAMBOO_AUTH, accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!dirRes.ok) {
      console.error(`BambooHR ${dirRes.status}: ${await dirRes.text()}`);
      return res.status(502).json({ error: "bamboohr_error" });
    }

    const dir = await dirRes.json();
    const employee = (dir.employees ?? []).find(
      (e) => e.workEmail?.toLowerCase() === email.toLowerCase(),
    );

    if (!employee) {
      // No matching employee — return 200 with not_employed=true so Ory can decide.
      console.log(`No BambooHR record for ${email} (identity ${identity_id})`);
      return res.json({ ok: true, employed: false });
    }

    // Pull the detailed record for richer fields (status, jobTitle, hireDate, etc.).
    const empRes = await fetch(
      `${BAMBOO_BASE}/employees/${employee.id}?fields=status,jobTitle,department,hireDate,terminationDate`,
      { headers: { authorization: BAMBOO_AUTH, accept: "application/json" }, signal: AbortSignal.timeout(10000) },
    );

    if (!empRes.ok) {
      console.error(`BambooHR detail ${empRes.status}: ${await empRes.text()}`);
      return res.status(502).json({ error: "bamboohr_error" });
    }

    const detail = await empRes.json();
    return res.json({
      ok: true,
      employed: detail.status === "Active",
      employee_id: employee.id,
      job_title: detail.jobTitle ?? null,
      department: detail.department ?? null,
      hire_date: detail.hireDate ?? null,
    });
  } catch (err) {
    console.error("Enrich error:", err.message);
    return res.status(502).json({ error: "enrich_failed" });
  }
});

app.listen(PORT, () => {
  console.log(`BambooHR integration listening on port ${PORT}`);
});
