import { describe, it, expect, beforeEach, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.stubEnv("CLEARBIT_API_KEY", "test-clearbit-key");
vi.stubEnv("ORY_ADMIN_API_KEY", "test-ory-admin-key");
vi.stubEnv("ORY_SDK_URL", "https://test.projects.oryapis.com");
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
    id: "ory-user-enrichment",
    traits: { email: "cto@acme-corp.com" },
    metadata_admin: {},
  },
  flow: { id: "flow-1", type: "registration" },
};

const clearbitResponse = {
  person: {
    name: { fullName: "Jane Smith", givenName: "Jane", familyName: "Smith" },
    employment: { name: "Acme Corp", title: "CTO", role: "engineering", seniority: "executive" },
  },
  company: {
    name: "Acme Corp",
    domain: "acme-corp.com",
    category: { industry: "Software", sector: "Technology" },
    metrics: { employees: 500, raised: 50000000, annualRevenue: 20000000 },
    geo: { country: "United States", state: "California", city: "San Francisco" },
  },
};

describe("Clearbit Integration", () => {
  let app: any;
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../src/handler");
    app = mod.app;
  });

  it("should return 200 immediately (async enrichment)", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const res = await testRequest(app, "post", "/webhooks/clearbit/registration", payload,
      { "X-Webhook-Secret": "test-webhook-secret" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it("should call Clearbit Combined API with correct auth", async () => {
    // Clearbit response
    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => clearbitResponse,
    });
    // Ory get identity
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "ory-user-enrichment",
        schema_id: "default",
        traits: { email: "cto@acme-corp.com" },
        metadata_admin: {},
        metadata_public: {},
        state: "active",
      }),
    });
    // Ory update identity
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await testRequest(app, "post", "/webhooks/clearbit/registration", payload,
      { "X-Webhook-Secret": "test-webhook-secret" });

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 200));

    // Verify Clearbit call
    const clearbitCall = mockFetch.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("clearbit.com"));
    expect(clearbitCall).toBeDefined();
    if (clearbitCall) {
      expect(clearbitCall[0]).toContain("cto%40acme-corp.com");
      expect(clearbitCall[1].headers.Authorization).toBe("Bearer test-clearbit-key");
    }
  });

  it("should update Ory identity metadata with enrichment data", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => clearbitResponse,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "ory-user-enrichment", schema_id: "default",
        traits: { email: "cto@acme-corp.com" },
        metadata_admin: { existing_key: "preserved" },
        metadata_public: {}, state: "active",
      }),
    });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await testRequest(app, "post", "/webhooks/clearbit/registration", payload,
      { "X-Webhook-Secret": "test-webhook-secret" });

    await new Promise((r) => setTimeout(r, 200));

    // Find the Ory PUT call
    const oryPutCall = mockFetch.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("admin/identities/") && c[1]?.method === "PUT");

    expect(oryPutCall).toBeDefined();
    if (oryPutCall) {
      const body = JSON.parse(oryPutCall[1].body);
      expect(body.metadata_admin.existing_key).toBe("preserved");
      expect(body.metadata_admin.clearbit.company.name).toBe("Acme Corp");
      expect(body.metadata_admin.clearbit.person.title).toBe("CTO");
      expect(body.metadata_admin.clearbit.enriched_at).toBeDefined();
    }
  });

  it("should handle Clearbit 404 gracefully (no data found)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const res = await testRequest(app, "post", "/webhooks/clearbit/registration", payload,
      { "X-Webhook-Secret": "test-webhook-secret" });

    expect(res.status).toBe(200);
    // Should not attempt to update Ory (no enrichment data)
  });

  it("should reject requests without webhook secret", async () => {
    const res = await testRequest(app, "post", "/webhooks/clearbit/registration", payload);
    expect(res.status).toBe(401);
  });
});
