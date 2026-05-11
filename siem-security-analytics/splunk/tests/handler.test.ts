import { describe, it, expect, beforeEach, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.stubEnv("SPLUNK_HEC_URL", "https://splunk.example.com:8088");
vi.stubEnv("SPLUNK_HEC_TOKEN", "test-hec-token-12345");
vi.stubEnv("SPLUNK_INDEX", "ory");
vi.stubEnv("WEBHOOK_SECRET", "test-webhook-secret");

import { SplunkHecClient } from "../src/splunk-client";
import {
  extractClientIp,
  determineAuthMethod,
  mapRegistrationEvent,
  mapLoginEvent,
} from "../src/event-mapper";

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

describe("Splunk Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '{"text":"Success","code":0}',
    });
  });

  describe("SplunkHecClient", () => {
    const config = {
      hecUrl: "https://splunk.example.com:8088",
      hecToken: "test-token",
      index: "ory",
      source: "ory:actions",
      sourcetype: "ory:auth",
      host: "ory-network",
    };

    it("should send a single event with correct format", async () => {
      const client = new SplunkHecClient(config);
      const event = client.buildAuthEvent({
        action: "success",
        authMethod: "password",
        userId: "user-1",
        userEmail: "test@example.com",
        sourceIp: "1.2.3.4",
        eventType: "login.success",
      });

      await client.sendEvent(event);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://splunk.example.com:8088/services/collector/event",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Splunk test-token",
            "Content-Type": "application/json",
          }),
        }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.source).toBe("ory:actions");
      expect(body.sourcetype).toBe("ory:auth");
      expect(body.index).toBe("ory");
      expect(body.event.action).toBe("success");
      expect(body.event.app).toBe("ory-network");
      expect(body.event.src).toBe("1.2.3.4");
      expect(body.event.user).toBe("test@example.com");
      expect(body.event.authentication_method).toBe("password");
    });

    it("should send batch events as newline-delimited JSON", async () => {
      const client = new SplunkHecClient(config);
      const event1 = client.buildAuthEvent({
        action: "success",
        authMethod: "password",
        userId: "u1",
        userEmail: "a@b.com",
        sourceIp: "1.1.1.1",
        eventType: "login.success",
      });
      const event2 = client.buildAuthEvent({
        action: "success",
        authMethod: "oidc",
        userId: "u2",
        userEmail: "c@d.com",
        sourceIp: "2.2.2.2",
        eventType: "registration.success",
      });

      await client.sendBatch([event1, event2]);

      const body = mockFetch.mock.calls[0][1].body;
      const lines = body.split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).event.user).toBe("a@b.com");
      expect(JSON.parse(lines[1]).event.user).toBe("c@d.com");
    });

    it("should build CIM-compliant auth events", async () => {
      const client = new SplunkHecClient(config);
      const event = client.buildAuthEvent({
        action: "failure",
        authMethod: "totp",
        userId: "user-1",
        userEmail: "test@example.com",
        sourceIp: "10.0.0.1",
        eventType: "login.failure",
        reason: "Invalid TOTP code",
      });

      expect(event.event.action).toBe("failure");
      expect(event.event.authentication_method).toBe("totp");
      expect(event.event.reason).toBe("Invalid TOTP code");
      expect(event.event.signature).toBe("login.failure");
      expect(event.time).toBeGreaterThan(0);
    });

    it("should handle HEC errors without throwing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => '{"text":"Invalid token","code":4}',
      });

      const client = new SplunkHecClient(config);
      const event = client.buildAuthEvent({
        action: "success",
        authMethod: "password",
        userId: "u1",
        userEmail: "a@b.com",
        sourceIp: "1.1.1.1",
        eventType: "login.success",
      });

      // Should not throw
      await expect(client.sendEvent(event)).resolves.toBeUndefined();
    });

    it("should handle network errors without throwing", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const client = new SplunkHecClient(config);
      const event = client.buildAuthEvent({
        action: "success",
        authMethod: "password",
        userId: "u1",
        userEmail: "a@b.com",
        sourceIp: "1.1.1.1",
        eventType: "login.success",
      });

      await expect(client.sendEvent(event)).resolves.toBeUndefined();
    });
  });

  describe("Event Mapper", () => {
    it("should extract client IP from X-Forwarded-For", () => {
      const ip = extractClientIp({
        "x-forwarded-for": ["203.0.113.42, 10.0.0.1"],
      });
      expect(ip).toBe("203.0.113.42");
    });

    it("should return 'unknown' when no headers", () => {
      expect(extractClientIp(undefined)).toBe("unknown");
    });

    it("should determine auth method from flow type", () => {
      expect(
        determineAuthMethod({
          identity: { id: "1", traits: { email: "" } },
          flow: { id: "f", type: "oidc" },
        }),
      ).toBe("oidc");

      expect(
        determineAuthMethod({
          identity: { id: "1", traits: { email: "" } },
          flow: { id: "f", type: "password" },
        }),
      ).toBe("password");
    });

    it("should map registration event correctly", () => {
      const payload = {
        identity: {
          id: "user-123",
          traits: { email: "test@example.com" },
        },
        flow: { id: "flow-1", type: "password" },
        request_headers: {
          "x-forwarded-for": ["1.2.3.4"],
        },
      };

      const result = mapRegistrationEvent(payload);
      expect(result.action).toBe("success");
      expect(result.eventType).toBe("registration.success");
      expect(result.sourceIp).toBe("1.2.3.4");
      expect(result.userId).toBe("user-123");
    });

    it("should map login event correctly", () => {
      const payload = {
        identity: {
          id: "user-456",
          traits: { email: "login@example.com" },
        },
        flow: { id: "flow-2", type: "totp" },
        request_headers: {
          "x-forwarded-for": ["5.6.7.8"],
        },
      };

      const result = mapLoginEvent(payload);
      expect(result.action).toBe("success");
      expect(result.eventType).toBe("login.success");
      expect(result.authMethod).toBe("totp");
    });
  });

  describe("Webhook Handler", () => {
    let app: any;

    beforeEach(async () => {
      const mod = await import("../src/handler");
      app = mod.app;
    });

    const payload = {
      identity: {
        id: "ory-user-789",
        traits: { email: "test@example.com" },
        metadata_public: {},
      },
      flow: { id: "flow-1", type: "password" },
      request_headers: {
        "x-forwarded-for": ["203.0.113.42"],
        "user-agent": ["Mozilla/5.0"],
      },
    };

    it("should return 200 on registration", async () => {
      const res = await testRequest(
        app,
        "post",
        "/webhooks/splunk/registration",
        payload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      expect(res.status).toBe(200);
    });

    it("should return 200 on login", async () => {
      const res = await testRequest(
        app,
        "post",
        "/webhooks/splunk/login",
        payload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      expect(res.status).toBe(200);
    });

    it("should reject requests without webhook secret", async () => {
      const res = await testRequest(
        app,
        "post",
        "/webhooks/splunk/registration",
        payload,
      );

      expect(res.status).toBe(401);
    });

    it("should send event to Splunk HEC on registration", async () => {
      await testRequest(
        app,
        "post",
        "/webhooks/splunk/registration",
        payload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      // Wait for async processing
      await new Promise((r) => setTimeout(r, 100));

      // Verify HEC was called
      const hecCall = mockFetch.mock.calls.find(
        (call: any[]) =>
          typeof call[0] === "string" &&
          call[0].includes("/services/collector/event"),
      );
      expect(hecCall).toBeDefined();

      if (hecCall) {
        const body = JSON.parse(hecCall[1].body);
        expect(body.event.signature).toBe("registration.success");
        expect(body.event.user).toBe("test@example.com");
        expect(body.event.src_user).toBe("ory-user-789");
      }
    });
  });
});
