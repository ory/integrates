import { describe, it, expect, beforeEach, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.stubEnv("ORY_SDK_URL", "https://test-project.projects.oryapis.com");
vi.stubEnv("ALLOWED_PATHS", "/health,/public");

// Test HTTP helper
async function testRequest(
  app: any,
  path: string,
  headers?: Record<string, string>,
) {
  const { createServer } = await import("http");
  return new Promise<{
    status: number;
    body: any;
    headers: Record<string, string>;
  }>((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address() as any;
      const url = `http://localhost:${addr.port}${path}`;
      fetch(url, { headers: { ...headers } })
        .then(async (res) => {
          const text = await res.text().catch(() => "");
          let json;
          try { json = JSON.parse(text); } catch { json = text; }
          const respHeaders: Record<string, string> = {};
          res.headers.forEach((v, k) => { respHeaders[k] = v; });
          server.close();
          resolve({ status: res.status, body: json, headers: respHeaders });
        })
        .catch((err) => { server.close(); reject(err); });
    });
  });
}

const validSession = {
  id: "session-abc-123",
  active: true,
  identity: {
    id: "identity-xyz-789",
    traits: {
      email: "user@example.com",
      name: { first: "Test", last: "User" },
    },
    metadata_public: { role: "admin", plan: "pro" },
  },
  authenticator_assurance_level: "aal1",
  expires_at: "2026-12-31T00:00:00Z",
};

describe("Traefik ForwardAuth Handler", () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../src/handler");
    app = mod.app;
  });

  describe("Public paths", () => {
    it("should allow /health without authentication", async () => {
      const res = await testRequest(app, "/health", {
        "x-forwarded-uri": "/health",
      });
      expect(res.status).toBe(200);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should allow /public paths without authentication", async () => {
      const res = await testRequest(app, "/public/docs", {
        "x-forwarded-uri": "/public/docs",
      });
      expect(res.status).toBe(200);
    });
  });

  describe("Authenticated requests", () => {
    it("should return 200 with identity headers for valid session", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => validSession,
      });

      const res = await testRequest(app, "/api/data", {
        "x-forwarded-uri": "/api/data",
        cookie: "ory_kratos_session=valid-session-token",
      });

      expect(res.status).toBe(200);
      expect(res.headers["x-user-id"]).toBe("identity-xyz-789");
      expect(res.headers["x-user-email"]).toBe("user@example.com");
      expect(res.headers["x-user-name"]).toBe("Test User");
      expect(res.headers["x-session-id"]).toBe("session-abc-123");
      expect(res.headers["x-auth-aal"]).toBe("aal1");

      // Verify metadata is passed as JSON
      const metadata = JSON.parse(res.headers["x-user-metadata"]);
      expect(metadata.role).toBe("admin");
    });

    it("should forward cookie to Ory's whoami endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => validSession,
      });

      await testRequest(app, "/api/data", {
        "x-forwarded-uri": "/api/data",
        cookie: "ory_kratos_session=my-session-token",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://test-project.projects.oryapis.com/sessions/whoami",
        expect.objectContaining({
          headers: expect.objectContaining({
            Cookie: "ory_kratos_session=my-session-token",
          }),
        }),
      );
    });

    it("should forward Authorization header for bearer tokens", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => validSession,
      });

      await testRequest(app, "/api/data", {
        "x-forwarded-uri": "/api/data",
        authorization: "Bearer some-jwt-token",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer some-jwt-token",
          }),
        }),
      );
    });
  });

  describe("Unauthenticated requests", () => {
    it("should return 401 when no cookie or auth header", async () => {
      const res = await testRequest(app, "/api/data", {
        "x-forwarded-uri": "/api/data",
      });
      expect(res.status).toBe(401);
    });

    it("should return 401 when Ory returns non-200", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

      const res = await testRequest(app, "/api/data", {
        "x-forwarded-uri": "/api/data",
        cookie: "ory_kratos_session=expired-token",
      });
      expect(res.status).toBe(401);
    });

    it("should return 401 when session is not active", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...validSession, active: false }),
      });

      const res = await testRequest(app, "/api/data", {
        "x-forwarded-uri": "/api/data",
        cookie: "ory_kratos_session=inactive-session",
      });
      expect(res.status).toBe(401);
    });

    it("should return 503 when Ory is unreachable", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const res = await testRequest(app, "/api/data", {
        "x-forwarded-uri": "/api/data",
        cookie: "ory_kratos_session=some-token",
      });
      expect(res.status).toBe(503);
    });
  });
});
