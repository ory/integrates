import { describe, it, expect, beforeEach, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.stubEnv("CASTLE_API_SECRET", "test-castle-secret");
vi.stubEnv("WEBHOOK_SECRET", "test-webhook-secret");
vi.stubEnv("CASTLE_CHALLENGE_THRESHOLD", "0.6");
vi.stubEnv("CASTLE_DENY_THRESHOLD", "0.9");

async function testRequest(
  app: any, method: "get" | "post", path: string,
  body?: unknown, headers?: Record<string, string>,
) {
  const { createServer } = await import("http");
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address() as any;
      const url = `http://localhost:${addr.port}${path}`;
      const options: RequestInit = {
        method: method.toUpperCase(),
        headers: { "Content-Type": "application/json", ...headers },
      };
      if (body) options.body = JSON.stringify(body);
      fetch(url, options)
        .then(async (res) => {
          const json = await res.json().catch(() => null);
          server.close();
          resolve({ status: res.status, body: json });
        })
        .catch((err) => { server.close(); reject(err); });
    });
  });
}

const payload = {
  identity: {
    id: "user-123", traits: { email: "test@example.com" },
    metadata_public: {}, metadata_admin: {}, created_at: "2025-01-01T00:00:00Z",
  },
  flow: { id: "flow-1", type: "password", transient_payload: {} },
  request_headers: { "x-forwarded-for": ["203.0.113.42"], "user-agent": ["Mozilla/5.0"] },
};

describe("Castle.io Integration", () => {
  let app: any;
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../src/handler");
    app = mod.app;
  });

  it("should allow low-risk logins and set metadata", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        risk: 0.2,
        policy: { action: "allow", id: "p1", name: "Default", revision_id: "r1" },
        signals: {},
      }),
    });

    const res = await testRequest(app, "post", "/webhooks/castle/login", payload,
      { "X-Webhook-Secret": "test-webhook-secret" });

    expect(res.status).toBe(200);
    expect(res.body.identity.metadata_public.risk_assessment.score).toBe(0.2);
    expect(res.body.identity.metadata_public.requires_mfa_stepup).toBe(false);
  });

  it("should flag medium-risk logins for MFA step-up", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        risk: 0.75,
        policy: { action: "challenge", id: "p1", name: "MFA Required", revision_id: "r1" },
        signals: {},
      }),
    });

    const res = await testRequest(app, "post", "/webhooks/castle/login", payload,
      { "X-Webhook-Secret": "test-webhook-secret" });

    expect(res.status).toBe(200);
    expect(res.body.identity.metadata_public.requires_mfa_stepup).toBe(true);
  });

  it("should deny high-risk logins with 400", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        risk: 0.95,
        policy: { action: "deny", id: "p1", name: "Block", revision_id: "r1" },
        signals: {},
      }),
    });

    const res = await testRequest(app, "post", "/webhooks/castle/login", payload,
      { "X-Webhook-Secret": "test-webhook-secret" });

    expect(res.status).toBe(400);
    expect(res.body.messages[0].type).toBe("error");
  });

  it("should fail open when Castle API is down", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Castle unreachable"));

    const res = await testRequest(app, "post", "/webhooks/castle/login", payload,
      { "X-Webhook-Secret": "test-webhook-secret" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it("should send correct auth header to Castle", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        risk: 0.1, policy: { action: "allow", id: "p1", name: "OK", revision_id: "r1" }, signals: {},
      }),
    });

    await testRequest(app, "post", "/webhooks/castle/login", payload,
      { "X-Webhook-Secret": "test-webhook-secret" });

    const authHeader = mockFetch.mock.calls[0][1].headers.Authorization;
    expect(authHeader).toMatch(/^Basic /);
  });

  it("should reject requests without webhook secret", async () => {
    const res = await testRequest(app, "post", "/webhooks/castle/login", payload);
    expect(res.status).toBe(401);
  });
});
