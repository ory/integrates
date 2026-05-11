import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the Svix SDK
const mockMessageCreate = vi.fn();
vi.mock("svix", () => ({
  Svix: vi.fn().mockImplementation(() => ({
    message: { create: mockMessageCreate },
  })),
}));

vi.stubEnv("SVIX_API_KEY", "test-svix-api-key");
vi.stubEnv("SVIX_APP_ID", "ory-identity-events");
vi.stubEnv("WEBHOOK_SECRET", "test-webhook-secret");

// Test HTTP helper
async function testRequest(
  app: any,
  method: "get" | "post",
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
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
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

describe("Svix Event Router", () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockMessageCreate.mockResolvedValue({ id: "msg_test123" });
    const mod = await import("../src/handler");
    app = mod.app;
  });

  const payload = {
    identity: {
      id: "ory-user-123",
      traits: {
        email: "user@example.com",
        name: { first: "Test", last: "User" },
      },
      metadata_public: { plan: "pro" },
    },
    flow: { id: "flow-abc", type: "password" },
    request_headers: {
      "x-forwarded-for": ["203.0.113.42"],
    },
  };

  it("should return 200 on registration event", async () => {
    const res = await testRequest(
      app,
      "post",
      "/webhooks/svix/registration",
      payload,
      { "X-Webhook-Secret": "test-webhook-secret" },
    );
    expect(res.status).toBe(200);
  });

  it("should publish registration event to Svix", async () => {
    await testRequest(
      app,
      "post",
      "/webhooks/svix/registration",
      payload,
      { "X-Webhook-Secret": "test-webhook-secret" },
    );

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 100));

    expect(mockMessageCreate).toHaveBeenCalledWith(
      "ory-identity-events",
      expect.objectContaining({
        eventType: "user.registered",
        eventId: "ory-user.registered-flow-abc",
        payload: expect.objectContaining({
          userId: "ory-user-123",
          email: "user@example.com",
          name: "Test User",
          flowId: "flow-abc",
          method: "password",
          sourceIp: "203.0.113.42",
        }),
      }),
    );
  });

  it("should publish login event to Svix", async () => {
    await testRequest(
      app,
      "post",
      "/webhooks/svix/login",
      payload,
      { "X-Webhook-Secret": "test-webhook-secret" },
    );

    await new Promise((r) => setTimeout(r, 100));

    expect(mockMessageCreate).toHaveBeenCalledWith(
      "ory-identity-events",
      expect.objectContaining({ eventType: "user.logged_in" }),
    );
  });

  it("should publish settings event", async () => {
    await testRequest(
      app,
      "post",
      "/webhooks/svix/settings",
      payload,
      { "X-Webhook-Secret": "test-webhook-secret" },
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(mockMessageCreate).toHaveBeenCalledWith(
      "ory-identity-events",
      expect.objectContaining({ eventType: "user.settings_updated" }),
    );
  });

  it("should use flow ID as idempotency key", async () => {
    await testRequest(
      app,
      "post",
      "/webhooks/svix/registration",
      payload,
      { "X-Webhook-Secret": "test-webhook-secret" },
    );

    await new Promise((r) => setTimeout(r, 100));

    expect(mockMessageCreate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        eventId: "ory-user.registered-flow-abc",
      }),
    );
  });

  it("should handle Svix API errors without failing", async () => {
    mockMessageCreate.mockRejectedValueOnce(new Error("Svix rate limited"));

    const res = await testRequest(
      app,
      "post",
      "/webhooks/svix/registration",
      payload,
      { "X-Webhook-Secret": "test-webhook-secret" },
    );

    // Should still return 200 to Ory
    expect(res.status).toBe(200);
  });

  it("should reject requests without webhook secret", async () => {
    const res = await testRequest(
      app,
      "post",
      "/webhooks/svix/registration",
      payload,
    );
    expect(res.status).toBe(401);
  });
});
