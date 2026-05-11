import { describe, it, expect, beforeEach, vi } from "vitest";

// We test the Worker's fetch handler by simulating the Cloudflare Workers environment

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const env = {
  ORY_SDK_URL: "https://test-project.projects.oryapis.com",
  PUBLIC_PATHS: "/health,/public",
  LOGIN_REDIRECT_URL: "",
};

const validSession = {
  id: "session-123",
  active: true,
  identity: {
    id: "identity-456",
    traits: {
      email: "user@example.com",
      name: { first: "Test", last: "User" },
    },
    metadata_public: { plan: "pro" },
  },
  authenticator_assurance_level: "aal1",
};

// Import the worker module
const { default: worker } = await import("../src/worker");

describe("Cloudflare Worker — Ory Edge Auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Public paths", () => {
    it("should pass through /health without auth", async () => {
      mockFetch.mockResolvedValueOnce(new Response("OK", { status: 200 }));

      const req = new Request("https://example.com/health");
      const res = await worker.fetch(req, env);

      // Should call fetch to forward to origin
      expect(mockFetch).toHaveBeenCalledWith(req);
    });

    it("should pass through /public paths without auth", async () => {
      mockFetch.mockResolvedValueOnce(new Response("OK"));

      const req = new Request("https://example.com/public/docs");
      await worker.fetch(req, env);

      expect(mockFetch).toHaveBeenCalledWith(req);
    });
  });

  describe("Unauthenticated requests", () => {
    it("should return 401 when no cookie or auth header", async () => {
      const req = new Request("https://example.com/api/data");
      const res = await worker.fetch(req, env);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("should redirect when LOGIN_REDIRECT_URL is set", async () => {
      const envWithRedirect = {
        ...env,
        LOGIN_REDIRECT_URL: "https://app.example.com/login",
      };

      const req = new Request("https://example.com/api/data");
      const res = await worker.fetch(req, envWithRedirect);

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain(
        "https://app.example.com/login",
      );
      expect(res.headers.get("Location")).toContain("return_to=%2Fapi%2Fdata");
    });
  });

  describe("Session cookie validation", () => {
    it("should validate session and forward with identity headers", async () => {
      // Mock Ory whoami response
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(validSession), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      // Mock origin response
      mockFetch.mockResolvedValueOnce(
        new Response("OK from origin", { status: 200 }),
      );

      const req = new Request("https://example.com/api/data", {
        headers: {
          Cookie: "ory_kratos_session=valid-token-123",
        },
      });

      const res = await worker.fetch(req, env);

      // First call should be to Ory's whoami
      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://test-project.projects.oryapis.com/sessions/whoami",
      );

      // Second call should be to origin with enriched headers
      if (mockFetch.mock.calls.length > 1) {
        const forwardedReq = mockFetch.mock.calls[1][0] as Request;
        expect(forwardedReq.headers.get("X-User-Id")).toBe("identity-456");
        expect(forwardedReq.headers.get("X-User-Email")).toBe(
          "user@example.com",
        );
        expect(forwardedReq.headers.get("X-User-Name")).toBe("Test User");
        expect(forwardedReq.headers.get("X-Session-Id")).toBe("session-123");
      }
    });

    it("should return 401 when Ory returns non-200", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401 }),
      );

      const req = new Request("https://example.com/api/data", {
        headers: { Cookie: "ory_kratos_session=expired-token" },
      });

      const res = await worker.fetch(req, env);
      expect(res.status).toBe(401);
    });

    it("should return 401 when session is not active", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...validSession, active: false }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const req = new Request("https://example.com/api/data", {
        headers: { Cookie: "ory_kratos_session=inactive-session" },
      });

      const res = await worker.fetch(req, env);
      expect(res.status).toBe(401);
    });

    it("should return 503 when Ory is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const req = new Request("https://example.com/api/data", {
        headers: { Cookie: "ory_kratos_session=some-token" },
      });

      const res = await worker.fetch(req, env);
      expect(res.status).toBe(503);
    });
  });
});
