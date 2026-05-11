import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock fetch for Segment API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.stubEnv("SEGMENT_WRITE_KEY", "test-write-key-abc123");
vi.stubEnv("WEBHOOK_SECRET", "test-webhook-secret");

import { SegmentClient } from "../src/segment-client";

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

describe("Segment Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: Segment API returns 200
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => "OK",
    });
  });

  describe("SegmentClient", () => {
    it("should send identify call with correct format", async () => {
      const client = new SegmentClient("test-key");
      await client.identify("user-1", { email: "test@example.com" });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.segment.io/v1/identify",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        }),
      );

      const body = JSON.parse(
        mockFetch.mock.calls[0][1].body,
      );
      expect(body.type).toBe("identify");
      expect(body.userId).toBe("user-1");
      expect(body.traits.email).toBe("test@example.com");
      expect(body.messageId).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });

    it("should send track call with correct format", async () => {
      const client = new SegmentClient("test-key");
      await client.track("user-1", "Test Event", { key: "value" });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.type).toBe("track");
      expect(body.event).toBe("Test Event");
      expect(body.properties.key).toBe("value");
    });

    it("should use Basic auth with write key", async () => {
      const client = new SegmentClient("my-write-key");
      await client.identify("user-1", {});

      const authHeader = mockFetch.mock.calls[0][1].headers.Authorization;
      const decoded = Buffer.from(
        authHeader.replace("Basic ", ""),
        "base64",
      ).toString();
      expect(decoded).toBe("my-write-key:");
    });

    it("should send batch call with multiple messages", async () => {
      const client = new SegmentClient("test-key");
      await client.batch([
        {
          type: "identify",
          userId: "u1",
          traits: {},
          timestamp: new Date().toISOString(),
          messageId: "m1",
          context: {
            library: { name: "test", version: "1.0" },
          },
        },
        {
          type: "track",
          userId: "u1",
          event: "Test",
          properties: {},
          timestamp: new Date().toISOString(),
          messageId: "m2",
          context: {
            library: { name: "test", version: "1.0" },
          },
        },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.segment.io/v1/batch",
        expect.anything(),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.batch).toHaveLength(2);
      expect(body.sentAt).toBeDefined();
    });

    it("should not throw on API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "error",
      });

      const client = new SegmentClient("test-key");
      // Should not throw
      await expect(
        client.identify("user-1", {}),
      ).resolves.toBeUndefined();
    });

    it("should not throw on network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const client = new SegmentClient("test-key");
      await expect(
        client.identify("user-1", {}),
      ).resolves.toBeUndefined();
    });
  });

  describe("Webhook Handler", () => {
    let app: any;

    beforeEach(async () => {
      const mod = await import("../src/handler");
      app = mod.app;
    });

    const registrationPayload = {
      identity: {
        id: "ory-user-123",
        traits: {
          email: "test@example.com",
          name: { first: "Test", last: "User" },
        },
        metadata_public: {},
        created_at: "2025-01-15T10:00:00Z",
      },
      flow: { id: "flow-1", type: "registration" },
      request_headers: {
        "user-agent": ["Mozilla/5.0"],
        "x-forwarded-for": ["203.0.113.42"],
      },
    };

    it("should return 200 on registration", async () => {
      const res = await testRequest(
        app,
        "post",
        "/webhooks/segment/registration",
        registrationPayload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      expect(res.status).toBe(200);
    });

    it("should send identify and track on registration", async () => {
      await testRequest(
        app,
        "post",
        "/webhooks/segment/registration",
        registrationPayload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      // Wait for async processing
      await new Promise((r) => setTimeout(r, 100));

      // Should have called Segment API (identify + track, possibly batched)
      expect(mockFetch).toHaveBeenCalled();
    });

    it("should return 200 on login", async () => {
      const loginPayload = {
        identity: {
          id: "ory-user-123",
          traits: { email: "test@example.com" },
        },
        flow: { id: "flow-2", type: "login" },
        request_headers: {
          "user-agent": ["Mozilla/5.0"],
          "x-forwarded-for": ["10.0.0.1"],
        },
      };

      const res = await testRequest(
        app,
        "post",
        "/webhooks/segment/login",
        loginPayload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      expect(res.status).toBe(200);
    });

    it("should reject requests without webhook secret", async () => {
      const res = await testRequest(
        app,
        "post",
        "/webhooks/segment/registration",
        registrationPayload,
      );

      expect(res.status).toBe(401);
    });

    it("should handle missing name traits", async () => {
      const payload = {
        ...registrationPayload,
        identity: {
          ...registrationPayload.identity,
          traits: { email: "test@example.com" },
        },
      };

      const res = await testRequest(
        app,
        "post",
        "/webhooks/segment/registration",
        payload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      expect(res.status).toBe(200);
    });
  });
});
