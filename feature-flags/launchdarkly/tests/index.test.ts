import { describe, it, expect, vi } from "vitest";
import { OryLaunchDarkly } from "../src/index";
import type { OrySession } from "../src/index";

const mockVariation = vi.fn();
const mockAllFlagsState = vi.fn();
const mockLDClient = {
  variation: mockVariation,
  allFlagsState: mockAllFlagsState,
} as any;

const session: OrySession = {
  id: "session-abc",
  active: true,
  identity: {
    id: "identity-xyz",
    traits: {
      email: "user@example.com",
      name: { first: "Test", last: "User" },
    },
    metadata_public: {
      billing: { plan: "pro", status: "active" },
      role: "admin",
    },
    schema_id: "default",
    created_at: "2025-01-15T10:00:00Z",
  },
  authenticator_assurance_level: "aal2",
};

describe("OryLaunchDarkly", () => {
  const oryLD = new OryLaunchDarkly(mockLDClient);

  describe("buildContext", () => {
    it("should build multi-kind context with user and session", () => {
      const context = oryLD.buildContext(session);

      expect(context.kind).toBe("multi");
      expect((context as any).user.key).toBe("identity-xyz");
      expect((context as any).user.email).toBe("user@example.com");
      expect((context as any).user.name).toBe("Test User");
      expect((context as any).session.key).toBe("session-abc");
      expect((context as any).session.aal).toBe("aal2");
    });

    it("should map billing metadata to plan attribute", () => {
      const context = oryLD.buildContext(session);
      expect((context as any).user.plan).toBe("pro");
      expect((context as any).user.subscriptionStatus).toBe("active");
    });

    it("should include custom metadata as attributes", () => {
      const context = oryLD.buildContext(session);
      expect((context as any).user.role).toBe("admin");
    });

    it("should handle missing optional fields", () => {
      const minimalSession: OrySession = {
        id: "s1",
        active: true,
        identity: {
          id: "i1",
          traits: { email: "minimal@example.com" },
        },
      };

      const context = oryLD.buildContext(minimalSession);
      expect((context as any).user.key).toBe("i1");
      expect((context as any).user.email).toBe("minimal@example.com");
      expect((context as any).user.name).toBeUndefined();
      expect((context as any).user.plan).toBeUndefined();
    });
  });

  describe("boolVariation", () => {
    it("should evaluate flag with Ory session context", async () => {
      mockVariation.mockResolvedValueOnce(true);

      const result = await oryLD.boolVariation("new-feature", session, false);

      expect(result).toBe(true);
      expect(mockVariation).toHaveBeenCalledWith(
        "new-feature",
        expect.objectContaining({ kind: "multi" }),
        false,
      );
    });

    it("should return default value when flag evaluation fails", async () => {
      mockVariation.mockResolvedValueOnce(false);

      const result = await oryLD.boolVariation("missing-flag", session, false);
      expect(result).toBe(false);
    });
  });

  describe("stringVariation", () => {
    it("should evaluate string flags", async () => {
      mockVariation.mockResolvedValueOnce("variant-b");
      const result = await oryLD.stringVariation("ui-theme", session, "default");
      expect(result).toBe("variant-b");
    });
  });

  describe("allFlagsState", () => {
    it("should return all flags for bootstrapping", async () => {
      const mockState = { toJSON: () => ({ "flag-a": true, "flag-b": "x" }) };
      mockAllFlagsState.mockResolvedValueOnce(mockState);

      const state = await oryLD.allFlagsState(session);
      expect(state).toBe(mockState);
      expect(mockAllFlagsState).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "multi" }),
      );
    });
  });
});
