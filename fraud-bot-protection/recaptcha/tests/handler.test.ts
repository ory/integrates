import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { RecaptchaConfig } from "../src/types";

// Mock global fetch for Google's siteverify API
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.stubEnv("RECAPTCHA_SECRET_KEY", "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe"); // Google test key
vi.stubEnv("WEBHOOK_SECRET", "test-webhook-secret");
vi.stubEnv("RECAPTCHA_VERSION", "v3");
vi.stubEnv("RECAPTCHA_SCORE_THRESHOLD", "0.5");

import { verifyRecaptchaToken } from "../src/verify";

// --- Helper to call the handler via HTTP ---

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

describe("reCAPTCHA Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("verifyRecaptchaToken (unit)", () => {
    const config: RecaptchaConfig = {
      version: "v3",
      scoreThreshold: 0.5,
      expectedAction: "register",
    };

    it("should pass v3 verification with high score", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          score: 0.9,
          action: "register",
        }),
      });

      const result = await verifyRecaptchaToken(
        "valid-token",
        "secret",
        "1.2.3.4",
        config,
      );

      expect(result.success).toBe(true);
      expect(result.score).toBe(0.9);

      // Verify fetch was called correctly
      expect(mockFetch).toHaveBeenCalledWith(
        "https://www.google.com/recaptcha/api/siteverify",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }),
      );
    });

    it("should fail v3 verification with low score", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          score: 0.1,
          action: "register",
        }),
      });

      const result = await verifyRecaptchaToken(
        "bot-token",
        "secret",
        "1.2.3.4",
        config,
      );

      expect(result.success).toBe(false);
      expect(result.failureReason).toContain("below threshold");
    });

    it("should fail v3 verification with wrong action", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          score: 0.9,
          action: "login", // expected "register"
        }),
      });

      const result = await verifyRecaptchaToken(
        "token",
        "secret",
        "1.2.3.4",
        config,
      );

      expect(result.success).toBe(false);
      expect(result.failureReason).toContain("Action mismatch");
    });

    it("should pass v2 verification when success is true", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const v2Config: RecaptchaConfig = {
        version: "v2",
        scoreThreshold: 0.5,
      };

      const result = await verifyRecaptchaToken(
        "v2-token",
        "secret",
        "1.2.3.4",
        v2Config,
      );

      expect(result.success).toBe(true);
    });

    it("should fail v2 verification when success is false", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          "error-codes": ["invalid-input-response"],
        }),
      });

      const v2Config: RecaptchaConfig = {
        version: "v2",
        scoreThreshold: 0.5,
      };

      const result = await verifyRecaptchaToken(
        "bad-token",
        "secret",
        "1.2.3.4",
        v2Config,
      );

      expect(result.success).toBe(false);
      expect(result.errorCodes).toContain("invalid-input-response");
    });

    it("should handle Google API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await verifyRecaptchaToken(
        "token",
        "secret",
        "1.2.3.4",
        config,
      );

      expect(result.success).toBe(false);
      expect(result.failureReason).toContain("HTTP 500");
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

      const result = await verifyRecaptchaToken(
        "token",
        "secret",
        "1.2.3.4",
        config,
      );

      expect(result.success).toBe(false);
      expect(result.failureReason).toContain("Network timeout");
    });
  });

  describe("Webhook handler (integration)", () => {
    // Need to re-mock fetch for handler's internal calls vs test HTTP calls.
    // We use a real HTTP server for the handler tests.
    let app: any;

    beforeEach(async () => {
      // Re-import to pick up env vars
      const mod = await import("../src/handler");
      app = mod.app;
    });

    it("should return 200 on successful verification", async () => {
      // Mock Google's response for the verify call
      mockFetch.mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.includes("recaptcha")) {
          return {
            ok: true,
            json: async () => ({ success: true, score: 0.9, action: "register" }),
          };
        }
        // Real fetch for test HTTP calls
        return globalThis.fetch(url);
      });

      const payload = {
        flow: {
          id: "flow-1",
          type: "registration",
          transient_payload: { recaptcha_token: "valid-token-123" },
        },
        identity: { id: "id-1", traits: { email: "test@example.com" } },
      };

      const res = await testRequest(
        app,
        "post",
        "/webhooks/recaptcha/verify",
        payload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      expect(res.status).toBe(200);
    });

    it("should return 400 when token is missing", async () => {
      const payload = {
        flow: {
          id: "flow-1",
          type: "registration",
          transient_payload: {},
        },
      };

      const res = await testRequest(
        app,
        "post",
        "/webhooks/recaptcha/verify",
        payload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      expect(res.status).toBe(400);
      expect(res.body.messages[0].type).toBe("error");
      expect(res.body.messages[0].instance_ptr).toBe("#/");
    });

    it("should return 400 when transient_payload is missing entirely", async () => {
      const payload = {
        flow: { id: "flow-1", type: "registration" },
      };

      const res = await testRequest(
        app,
        "post",
        "/webhooks/recaptcha/verify",
        payload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      expect(res.status).toBe(400);
    });

    it("should reject requests without webhook secret", async () => {
      const payload = {
        flow: {
          id: "flow-1",
          type: "registration",
          transient_payload: { recaptcha_token: "token" },
        },
      };

      const res = await testRequest(
        app,
        "post",
        "/webhooks/recaptcha/verify",
        payload,
      );

      expect(res.status).toBe(401);
    });

    it("should validate error response matches Ory format", async () => {
      const payload = {
        flow: {
          id: "flow-1",
          type: "registration",
          transient_payload: {},
        },
      };

      const res = await testRequest(
        app,
        "post",
        "/webhooks/recaptcha/verify",
        payload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      // Verify Ory error response format
      expect(res.body).toHaveProperty("messages");
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(res.body.messages[0]).toHaveProperty("instance_ptr");
      expect(res.body.messages[0]).toHaveProperty("message");
      expect(res.body.messages[0]).toHaveProperty("type");
    });
  });
});
