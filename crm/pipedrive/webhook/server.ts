// SPDX-License-Identifier: Apache-2.0
//
// Pipedrive <> Ory Actions webhook handler.
//
// Two endpoints:
//   POST /pipedrive/sync-user            — async post-registration / post-settings.
//                                          Creates or updates a Pipedrive person,
//                                          stores the Ory identity id on a custom field.
//   POST /pipedrive/track-login-activity — async post-login. Looks up the Pipedrive
//                                          person by email and logs a "User Login"
//                                          activity with device + IP context.
//
// Both endpoints are async (response.ignore: true): the handler returns 200 to
// Ory immediately and runs the Pipedrive calls in the background so Pipedrive
// availability never blocks user flows.

import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

const PORT = Number(process.env.PORT) || 3000;
const ORY_WEBHOOK_SECRET = process.env.ORY_WEBHOOK_SECRET;
const PIPEDRIVE_API_TOKEN = process.env.PIPEDRIVE_API_TOKEN;
const PIPEDRIVE_API_BASE = process.env.PIPEDRIVE_API_BASE ?? "https://api.pipedrive.com/v1";

if (!ORY_WEBHOOK_SECRET || !PIPEDRIVE_API_TOKEN) {
  console.error("ORY_WEBHOOK_SECRET and PIPEDRIVE_API_TOKEN must be set in .env");
  process.exit(1);
}

interface SyncUserRequest {
  id?: string;
  traits?: {
    email?: string;
    name?: { first?: string; last?: string } | string;
  };
  created_at?: string;
}

interface TrackLoginRequest {
  id?: string;
  traits?: { email?: string; name?: { first?: string; last?: string } | string };
  login_time?: string;
  ip_address?: string;
  user_agent?: string;
  login_method?: string;
  session_id?: string;
}

interface PipedrivePerson {
  id: number;
  name?: string;
  email?: Array<{ value: string }>;
}

interface PipedriveSearchResponse {
  data?: { items?: Array<{ item: PipedrivePerson }> };
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

function pipedriveUrl(path: string, query: Record<string, string> = {}): string {
  const params = new URLSearchParams({ api_token: PIPEDRIVE_API_TOKEN as string, ...query });
  return `${PIPEDRIVE_API_BASE}${path}?${params.toString()}`;
}

function deriveName(traits: SyncUserRequest["traits"]): string {
  const name = traits?.name;
  if (typeof name === "string") return name;
  if (name && typeof name === "object") {
    const parts = [name.first, name.last].filter((s): s is string => Boolean(s));
    if (parts.length > 0) return parts.join(" ");
  }
  return traits?.email ?? "Unknown";
}

function parseUserAgent(ua: string | undefined): string {
  if (!ua) return "Unknown Device";
  if (ua.includes("Mobile")) return "Mobile Device";
  if (ua.includes("Chrome")) return "Chrome Browser";
  if (ua.includes("Firefox")) return "Firefox Browser";
  if (ua.includes("Safari")) return "Safari Browser";
  return "Unknown Device";
}

async function findPersonByEmail(email: string): Promise<PipedrivePerson | null> {
  const res = await fetch(pipedriveUrl("/persons/search", { term: email, fields: "email" }), {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    console.warn(`Pipedrive search ${res.status}`);
    return null;
  }
  const data = (await res.json()) as PipedriveSearchResponse;
  return data.data?.items?.[0]?.item ?? null;
}

async function upsertPerson(req: SyncUserRequest): Promise<void> {
  const email = req.traits?.email;
  if (!email || !req.id) return;

  const existing = await findPersonByEmail(email);
  const payload = {
    name: deriveName(req.traits),
    email: [{ value: email, primary: true }],
    custom_fields: { ory_identity_id: req.id },
  };

  if (existing) {
    const res = await fetch(pipedriveUrl(`/persons/${existing.id}`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn(`Pipedrive update ${res.status}: ${await res.text().catch(() => "")}`);
    }
    return;
  }

  const res = await fetch(pipedriveUrl("/persons"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    console.warn(`Pipedrive create ${res.status}: ${await res.text().catch(() => "")}`);
  }
}

async function createLoginActivity(person: PipedrivePerson, body: TrackLoginRequest): Promise<void> {
  const traits = body.traits;
  const name = typeof traits?.name === "string" ? traits.name : traits?.email ?? "user";
  const sessionPreview = body.session_id ? `${body.session_id.slice(0, 8)}…` : "n/a";
  const note = [
    "Login details:",
    `- Time: ${body.login_time ?? "n/a"}`,
    `- IP: ${body.ip_address ?? "n/a"}`,
    `- Device: ${parseUserAgent(body.user_agent)}`,
    `- Method: ${body.login_method ?? "n/a"}`,
    `- Session: ${sessionPreview}`,
  ].join("\n");

  const res = await fetch(pipedriveUrl("/activities"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      person_id: person.id,
      subject: `User Login - ${name}`,
      type: "task",
      note,
      done: 1,
      due_date: new Date().toISOString().split("T")[0],
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    console.warn(`Pipedrive activity ${res.status}: ${await res.text().catch(() => "")}`);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/pipedrive/sync-user",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, SyncUserRequest>, res: Response) => {
    res.status(200).json({ success: true });
    try {
      await upsertPerson(req.body);
      console.log(`Pipedrive: synced ${req.body.id} (${req.body.traits?.email})`);
    } catch (err) {
      console.warn(`Pipedrive sync failed for ${req.body.id}: ${(err as Error).message}`);
    }
  },
);

app.post(
  "/pipedrive/track-login-activity",
  verifyWebhookSecret,
  async (req: Request<unknown, unknown, TrackLoginRequest>, res: Response) => {
    res.status(200).json({ success: true });
    const email = req.body.traits?.email;
    if (!email) return;
    try {
      const person = await findPersonByEmail(email);
      if (!person) {
        console.log(`Pipedrive: no person for ${email}, skipping login activity`);
        return;
      }
      await createLoginActivity(person, req.body);
      console.log(`Pipedrive: logged login for ${email}`);
    } catch (err) {
      console.warn(`Pipedrive login-activity failed: ${(err as Error).message}`);
    }
  },
);

app.listen(PORT, () => {
  console.log(`Pipedrive integration listening on port ${PORT}`);
});
