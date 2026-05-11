import { describe, it, expect, beforeEach, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.stubEnv("ZENDESK_API_TOKEN", "test-zendesk-token");
vi.stubEnv("ZENDESK_SUBDOMAIN", "test-company");
vi.stubEnv("ZENDESK_EMAIL", "admin@test.com");
vi.stubEnv("WEBHOOK_SECRET", "test-webhook-secret");

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
          server.close(); resolve({ status: res.status, body: json });
        })
        .catch((err) => { server.close(); reject(err); });
    });
  });
}

const payload = {
  identity: {
    id: "ory-user-789",
    traits: { email: "support@example.com", name: { first: "Support", last: "User" } },
    metadata_public: { billing: { plan: "enterprise", status: "active" } },
  },
  flow: { id: "flow-1", type: "registration" },
};

describe("Zendesk Integration", () => {
  let app: any;
  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ user: { id: 123 } }) });
    const mod = await import("../src/handler");
    app = mod.app;
  });

  it("should return 200 on registration", async () => {
    const res = await testRequest(app, "post", "/webhooks/zendesk/registration", payload,
      { "X-Webhook-Secret": "test-webhook-secret" });
    expect(res.status).toBe(200);
  });

  it("should call Zendesk create_or_update API", async () => {
    await testRequest(app, "post", "/webhooks/zendesk/registration", payload,
      { "X-Webhook-Secret": "test-webhook-secret" });
    await new Promise((r) => setTimeout(r, 100));

    const zdCall = mockFetch.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("zendesk.com"));
    expect(zdCall).toBeDefined();
    if (zdCall) {
      expect(zdCall[0]).toContain("create_or_update");
      const body = JSON.parse(zdCall[1].body);
      expect(body.user.email).toBe("support@example.com");
      expect(body.user.external_id).toBe("ory-user-789");
      expect(body.user.user_fields.subscription_plan).toBe("enterprise");
    }
  });

  it("should reject requests without webhook secret", async () => {
    const res = await testRequest(app, "post", "/webhooks/zendesk/registration", payload);
    expect(res.status).toBe(401);
  });
});
