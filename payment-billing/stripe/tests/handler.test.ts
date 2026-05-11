import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Stripe before importing handler
const mockCustomersCreate = vi.fn();
const mockSubscriptionsList = vi.fn();

vi.mock("stripe", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      customers: { create: mockCustomersCreate },
      subscriptions: { list: mockSubscriptionsList },
    })),
  };
});

import request from "supertest";

// Inline a lightweight supertest-like helper since we don't want the dependency
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
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
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

// Set env before importing handler
vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake_key_for_testing");
vi.stubEnv("WEBHOOK_SECRET", "test-webhook-secret");

const { app } = await import("../src/handler");

describe("Stripe Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /health", () => {
    it("should return 200 with status ok", async () => {
      const res = await testRequest(app, "get", "/health");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok", integration: "stripe" });
    });
  });

  describe("POST /webhooks/stripe/registration", () => {
    const validPayload = {
      identity: {
        id: "ory-identity-123",
        traits: {
          email: "test@example.com",
          name: { first: "Test", last: "User" },
        },
        metadata_admin: {},
        metadata_public: {},
      },
      flow: { id: "flow-123", type: "registration" },
    };

    it("should reject requests without webhook secret", async () => {
      const res = await testRequest(
        app,
        "post",
        "/webhooks/stripe/registration",
        validPayload,
      );
      expect(res.status).toBe(401);
    });

    it("should create a Stripe customer and return metadata", async () => {
      mockCustomersCreate.mockResolvedValue({
        id: "cus_test123",
        email: "test@example.com",
      });

      const res = await testRequest(
        app,
        "post",
        "/webhooks/stripe/registration",
        validPayload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      expect(res.status).toBe(200);
      expect(mockCustomersCreate).toHaveBeenCalledWith({
        email: "test@example.com",
        name: "Test User",
        metadata: { ory_identity_id: "ory-identity-123" },
      });

      expect(res.body.identity.metadata_admin.stripe_customer_id).toBe(
        "cus_test123",
      );
      expect(res.body.identity.metadata_public.billing).toEqual({
        customer_id: "cus_test123",
        status: "free",
        plan: "none",
      });
    });

    it("should handle missing email gracefully", async () => {
      const payload = {
        identity: { id: "id-1", traits: {}, metadata_admin: {} },
        flow: { id: "flow-1", type: "registration" },
      };

      const res = await testRequest(
        app,
        "post",
        "/webhooks/stripe/registration",
        payload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      expect(res.status).toBe(200);
      expect(mockCustomersCreate).not.toHaveBeenCalled();
    });

    it("should handle Stripe API errors without blocking registration", async () => {
      mockCustomersCreate.mockRejectedValue(new Error("Stripe API error"));

      const res = await testRequest(
        app,
        "post",
        "/webhooks/stripe/registration",
        validPayload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
    });

    it("should handle name with only first name", async () => {
      mockCustomersCreate.mockResolvedValue({ id: "cus_456" });
      const payload = {
        ...validPayload,
        identity: {
          ...validPayload.identity,
          traits: { email: "test@example.com", name: { first: "Test" } },
        },
      };

      await testRequest(
        app,
        "post",
        "/webhooks/stripe/registration",
        payload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      expect(mockCustomersCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Test" }),
      );
    });
  });

  describe("POST /webhooks/stripe/login", () => {
    it("should return empty response when no stripe_customer_id", async () => {
      const payload = {
        identity: {
          id: "id-1",
          traits: { email: "test@example.com" },
          metadata_admin: {},
        },
        flow: { id: "flow-1", type: "login" },
      };

      const res = await testRequest(
        app,
        "post",
        "/webhooks/stripe/login",
        payload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
      expect(mockSubscriptionsList).not.toHaveBeenCalled();
    });

    it("should enrich session with active subscription data", async () => {
      mockSubscriptionsList.mockResolvedValue({
        data: [
          {
            status: "active",
            current_period_end: 1735689600, // 2025-01-01T00:00:00Z
            items: {
              data: [
                {
                  price: {
                    product: { name: "Pro Plan" },
                  },
                },
              ],
            },
          },
        ],
      });

      const payload = {
        identity: {
          id: "id-1",
          traits: { email: "test@example.com" },
          metadata_admin: { stripe_customer_id: "cus_test123" },
        },
        flow: { id: "flow-1", type: "login" },
      };

      const res = await testRequest(
        app,
        "post",
        "/webhooks/stripe/login",
        payload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      expect(res.status).toBe(200);
      expect(res.body.identity.metadata_public.billing).toEqual({
        customer_id: "cus_test123",
        status: "active",
        plan: "Pro Plan",
        current_period_end: "2025-01-01T00:00:00.000Z",
      });
    });

    it("should return free status when no subscriptions", async () => {
      mockSubscriptionsList.mockResolvedValue({ data: [] });

      const payload = {
        identity: {
          id: "id-1",
          traits: { email: "test@example.com" },
          metadata_admin: { stripe_customer_id: "cus_test123" },
        },
        flow: { id: "flow-1", type: "login" },
      };

      const res = await testRequest(
        app,
        "post",
        "/webhooks/stripe/login",
        payload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      expect(res.status).toBe(200);
      expect(res.body.identity.metadata_public.billing.status).toBe("free");
      expect(res.body.identity.metadata_public.billing.plan).toBe("none");
    });

    it("should handle Stripe API errors gracefully on login", async () => {
      mockSubscriptionsList.mockRejectedValue(new Error("Stripe down"));

      const payload = {
        identity: {
          id: "id-1",
          traits: { email: "test@example.com" },
          metadata_admin: { stripe_customer_id: "cus_test123" },
        },
        flow: { id: "flow-1", type: "login" },
      };

      const res = await testRequest(
        app,
        "post",
        "/webhooks/stripe/login",
        payload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
    });

    it("should handle canceled subscription status", async () => {
      mockSubscriptionsList.mockResolvedValue({
        data: [
          {
            status: "canceled",
            current_period_end: 1735689600,
            items: {
              data: [{ price: { product: { name: "Basic" } } }],
            },
          },
        ],
      });

      const payload = {
        identity: {
          id: "id-1",
          traits: { email: "test@example.com" },
          metadata_admin: { stripe_customer_id: "cus_test123" },
        },
        flow: { id: "flow-1", type: "login" },
      };

      const res = await testRequest(
        app,
        "post",
        "/webhooks/stripe/login",
        payload,
        { "X-Webhook-Secret": "test-webhook-secret" },
      );

      expect(res.body.identity.metadata_public.billing.status).toBe(
        "canceled",
      );
    });
  });
});
