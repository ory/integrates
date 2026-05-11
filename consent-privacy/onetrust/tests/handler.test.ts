import { describe, it, expect, beforeEach, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.stubEnv("ONETRUST_API_KEY", "test-onetrust-key");
vi.stubEnv("WEBHOOK_SECRET", "test-webhook-secret");
vi.stubEnv("ORY_ADMIN_API_KEY", "test-ory-admin-key");
vi.stubEnv("ORY_SDK_URL", "https://test.projects.oryapis.com");

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

describe("OneTrust Integration", () => {
  let app: any;
  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const mod = await import("../src/handler");
    app = mod.app;
  });

  it("should store consent preferences in identity metadata", async () => {
    const payload = {
      identity: { id: "user-1", traits: { email: "test@example.com" }, metadata_public: {} },
      flow: {
        id: "flow-1", type: "registration",
        transient_payload: { consent: { marketing: true, analytics: false } },
      },
    };

    const res = await testRequest(app, "post", "/webhooks/onetrust/registration", payload,
      { "X-Webhook-Secret": "test-webhook-secret" });

    expect(res.status).toBe(200);
    expect(res.body.identity.metadata_public.consent.preferences).toEqual({
      marketing: true, analytics: false,
    });
  });

  it("should return empty response when no consent in transient_payload", async () => {
    const payload = {
      identity: { id: "user-1", traits: { email: "test@example.com" } },
      flow: { id: "flow-1", type: "registration" },
    };

    const res = await testRequest(app, "post", "/webhooks/onetrust/registration", payload,
      { "X-Webhook-Secret": "test-webhook-secret" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it("should handle DSR deletion request", async () => {
    // Mock Ory identity search
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "identity-to-delete", traits: { email: "delete@example.com" } }],
    });
    // Mock Ory identity deletion
    mockFetch.mockResolvedValueOnce({ ok: true });

    const res = await testRequest(app, "post", "/webhooks/onetrust/dsr",
      { requestType: "DELETE", identifier: "delete@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe("deleted");
  });

  it("should handle DSR export request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "identity-export", traits: { email: "export@example.com" } }],
    });

    const res = await testRequest(app, "post", "/webhooks/onetrust/dsr",
      { requestType: "EXPORT", identifier: "export@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe("exported");
    expect(res.body.data.id).toBe("identity-export");
  });

  it("should reject webhook requests without secret", async () => {
    const res = await testRequest(app, "post", "/webhooks/onetrust/registration", {});
    expect(res.status).toBe(401);
  });
});
