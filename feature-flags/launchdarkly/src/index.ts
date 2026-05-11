/**
 * Ory + LaunchDarkly Integration
 *
 * SDK wrapper that automatically maps Ory session/identity data to
 * LaunchDarkly evaluation contexts, enabling identity-aware feature flags.
 *
 * Usage:
 *   import { OryLaunchDarkly } from '@ory-integrations/launchdarkly';
 *
 *   const oryLD = new OryLaunchDarkly(ldClient);
 *
 *   // In your request handler, after Ory session validation:
 *   const showNewUI = await oryLD.boolVariation(
 *     'new-dashboard-ui',
 *     orySession,   // from Ory's /sessions/whoami response
 *     false,        // default value
 *   );
 *
 * The wrapper maps Ory identity traits (email, plan, role, etc.) to
 * LaunchDarkly context attributes for targeting rules.
 *
 * SECURITY: Store LAUNCHDARKLY_SDK_KEY in a secret manager.
 */

import type { LDClient, LDContext, LDMultiKindContext } from "@launchdarkly/node-server-sdk";

/** Ory session object (from /sessions/whoami) */
export interface OrySession {
  id: string;
  active: boolean;
  identity: {
    id: string;
    traits: {
      email?: string;
      name?: { first?: string; last?: string };
      [key: string]: unknown;
    };
    metadata_public?: Record<string, unknown>;
    schema_id?: string;
    created_at?: string;
  };
  authenticator_assurance_level?: string;
}

/**
 * Ory + LaunchDarkly wrapper.
 * Maps Ory sessions to LaunchDarkly multi-context for flag evaluation.
 */
export class OryLaunchDarkly {
  private client: LDClient;

  constructor(client: LDClient) {
    this.client = client;
  }

  /**
   * Build a LaunchDarkly multi-kind context from an Ory session.
   *
   * Creates two context kinds:
   *   - "user": keyed by Ory identity ID, with traits as attributes
   *   - "session": keyed by session ID, with AAL and session metadata
   */
  buildContext(session: OrySession): LDMultiKindContext {
    const identity = session.identity;
    const traits = identity.traits;
    const metadata = identity.metadata_public || {};

    return {
      kind: "multi",
      user: {
        key: identity.id,
        email: traits.email,
        firstName: traits.name?.first,
        lastName: traits.name?.last,
        name: [traits.name?.first, traits.name?.last].filter(Boolean).join(" ") || undefined,
        // Map metadata fields as custom attributes for targeting
        plan: metadata.billing && typeof metadata.billing === "object"
          ? (metadata.billing as any).plan
          : undefined,
        subscriptionStatus: metadata.billing && typeof metadata.billing === "object"
          ? (metadata.billing as any).status
          : undefined,
        // Ory-specific attributes
        schemaId: identity.schema_id,
        createdAt: identity.created_at,
        // Spread any other metadata as custom attributes
        ...Object.fromEntries(
          Object.entries(metadata).filter(([k]) => k !== "billing" && k !== "risk_assessment"),
        ),
      } as LDContext,
      session: {
        key: session.id,
        aal: session.authenticator_assurance_level,
      } as LDContext,
    };
  }

  /** Evaluate a boolean flag using the Ory session as context */
  async boolVariation(
    flagKey: string,
    session: OrySession,
    defaultValue: boolean,
  ): Promise<boolean> {
    const context = this.buildContext(session);
    return this.client.variation(flagKey, context, defaultValue);
  }

  /** Evaluate a string flag */
  async stringVariation(
    flagKey: string,
    session: OrySession,
    defaultValue: string,
  ): Promise<string> {
    const context = this.buildContext(session);
    return this.client.variation(flagKey, context, defaultValue);
  }

  /** Evaluate a number flag */
  async numberVariation(
    flagKey: string,
    session: OrySession,
    defaultValue: number,
  ): Promise<number> {
    const context = this.buildContext(session);
    return this.client.variation(flagKey, context, defaultValue);
  }

  /** Evaluate a JSON flag */
  async jsonVariation(
    flagKey: string,
    session: OrySession,
    defaultValue: unknown,
  ): Promise<unknown> {
    const context = this.buildContext(session);
    return this.client.variation(flagKey, context, defaultValue);
  }

  /** Get all flag values for an Ory session (useful for bootstrapping client-side flags) */
  async allFlagsState(session: OrySession) {
    const context = this.buildContext(session);
    return this.client.allFlagsState(context);
  }
}
