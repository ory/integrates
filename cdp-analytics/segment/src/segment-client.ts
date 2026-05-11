/**
 * Lightweight Segment HTTP API client.
 *
 * Uses Segment's HTTP Tracking API directly (no SDK dependency).
 * Authentication: Basic auth with write key as username, empty password.
 *
 * SECURITY: The SEGMENT_WRITE_KEY must be stored in a secret manager.
 *   - Use a secret manager (Cloud Secret Manager, AWS Secrets Manager, Vault, etc.)
 */

import type {
  SegmentIdentifyPayload,
  SegmentTrackPayload,
  SegmentBatchPayload,
} from "./types";

export class SegmentClient {
  private writeKey: string;
  private apiUrl: string;
  private authHeader: string;

  constructor(writeKey: string, apiUrl = "https://api.segment.io/v1") {
    this.writeKey = writeKey;
    this.apiUrl = apiUrl;
    // Segment uses Basic auth: base64(writeKey + ":")
    this.authHeader = `Basic ${Buffer.from(this.writeKey + ":").toString("base64")}`;
  }

  /** Generate a simple unique message ID */
  private generateMessageId(): string {
    return `ory-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  }

  /** Send an identify call */
  async identify(
    userId: string,
    traits: Record<string, unknown>,
    context?: { ip?: string; userAgent?: string },
    timestamp?: string,
  ): Promise<void> {
    const payload: SegmentIdentifyPayload = {
      type: "identify",
      userId,
      traits,
      timestamp: timestamp || new Date().toISOString(),
      messageId: this.generateMessageId(),
      context: {
        library: { name: "@ory-integrations/segment", version: "1.0.0" },
        ip: context?.ip,
        userAgent: context?.userAgent,
      },
    };
    await this.send("/identify", payload);
  }

  /** Send a track call */
  async track(
    userId: string,
    event: string,
    properties: Record<string, unknown>,
    context?: { ip?: string; userAgent?: string },
    timestamp?: string,
  ): Promise<void> {
    const payload: SegmentTrackPayload = {
      type: "track",
      userId,
      event,
      properties,
      timestamp: timestamp || new Date().toISOString(),
      messageId: this.generateMessageId(),
      context: {
        library: { name: "@ory-integrations/segment", version: "1.0.0" },
        ip: context?.ip,
        userAgent: context?.userAgent,
      },
    };
    await this.send("/track", payload);
  }

  /** Send a batch of identify/track calls */
  async batch(
    messages: Array<SegmentIdentifyPayload | SegmentTrackPayload>,
  ): Promise<void> {
    const payload: SegmentBatchPayload = {
      batch: messages,
      sentAt: new Date().toISOString(),
    };
    await this.send("/batch", payload);
  }

  private async send(path: string, body: unknown): Promise<void> {
    try {
      const res = await fetch(`${this.apiUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.authHeader,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn(
          `Segment API error: ${res.status} ${res.statusText} - ${text}`,
        );
      }
    } catch (err) {
      // Fire-and-forget: log but don't throw
      console.warn(`Segment API request failed: ${(err as Error).message}`);
    }
  }
}
