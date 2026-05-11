// SPDX-License-Identifier: Apache-2.0
//
// Reference webhook handler for the Ory <> BambooHR integration.
// Looks up the BambooHR employee matching an Ory identity's email and returns
// employment fields back to Ory so the post-flow Action can decide whether to
// allow the flow.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
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

interface BamboohrEnrichRequest {
  identity_id?: string;
  email?: string;
}

interface BamboohrDirectoryEmployee {
  id: string;
  workEmail?: string;
}
interface BamboohrDirectoryResponse {
  employees?: BamboohrDirectoryEmployee[];
}
interface BamboohrEmployeeDetail {
  status?: string;
  jobTitle?: string;
  department?: string;
  hireDate?: string;
  terminationDate?: string;
}

const app = express();
app.use(express.json());

function verifyWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const provided = req.header("x-webhook-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(ORY_WEBHOOK_SECRET as string);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: "invalid webhook secret" });
    return;
  }
  next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/bamboohr/enrich-user",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, BamboohrEnrichRequest>, res: Response) => {
    const { identity_id, email } = req.body;
    if (!email) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    try {
      // BambooHR has no direct lookup-by-email API; fetch the directory and
      // filter. For large directories, swap to /reports/custom with a saved
      // report to avoid the full-scan cost.
      const dirRes = await fetch(`${BAMBOO_BASE}/employees/directory`, {
        headers: { authorization: BAMBOO_AUTH, accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (!dirRes.ok) {
        console.error(`BambooHR ${dirRes.status}: ${await dirRes.text()}`);
        res.status(502).json({ error: "bamboohr_error" });
        return;
      }

      const dir = (await dirRes.json()) as BamboohrDirectoryResponse;
      const employee = (dir.employees ?? []).find(
        (e) => e.workEmail?.toLowerCase() === email.toLowerCase(),
      );

      if (!employee) {
        console.log(`No BambooHR record for ${email} (identity ${identity_id})`);
        res.json({ ok: true, employed: false });
        return;
      }

      const empRes = await fetch(
        `${BAMBOO_BASE}/employees/${employee.id}?fields=status,jobTitle,department,hireDate,terminationDate`,
        {
          headers: { authorization: BAMBOO_AUTH, accept: "application/json" },
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!empRes.ok) {
        console.error(`BambooHR detail ${empRes.status}: ${await empRes.text()}`);
        res.status(502).json({ error: "bamboohr_error" });
        return;
      }

      const detail = (await empRes.json()) as BamboohrEmployeeDetail;
      res.json({
        ok: true,
        employed: detail.status === "Active",
        employee_id: employee.id,
        job_title: detail.jobTitle ?? null,
        department: detail.department ?? null,
        hire_date: detail.hireDate ?? null,
      });
    } catch (err) {
      console.error("Enrich error:", (err as Error).message);
      res.status(502).json({ error: "enrich_failed" });
    }
  },
);

app.listen(PORT, () => {
  console.log(`BambooHR integration listening on port ${PORT}`);
});
