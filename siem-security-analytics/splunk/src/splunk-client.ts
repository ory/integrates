/**
 * Splunk HTTP Event Collector (HEC) client.
 *
 * SECURITY: The SPLUNK_HEC_TOKEN must be stored in a secret manager.
 *   - Use a secret manager (Cloud Secret Manager, AWS Secrets Manager, Vault, etc.)
 */

import type { SplunkHecEvent, SplunkHecConfig, SplunkCimAuthEvent } from "./types";

export class SplunkHecClient {
  private config: SplunkHecConfig;

  constructor(config: SplunkHecConfig) {
    this.config = config;
  }

  /** Send a single event to Splunk HEC */
  async sendEvent(event: SplunkHecEvent): Promise<void> {
    await this.send(JSON.stringify(event));
  }

  /**
   * Send multiple events in a batch.
   * Splunk HEC uses newline-delimited JSON for batch (NOT a JSON array).
   */
  async sendBatch(events: SplunkHecEvent[]): Promise<void> {
    const payload = events.map((e) => JSON.stringify(e)).join("\n");
    await this.send(payload);
  }

  /** Build a CIM-compliant authentication event */
  buildAuthEvent(params: {
    action: "success" | "failure" | "error";
    authMethod: string;
    userId: string;
    userEmail: string;
    sourceIp: string;
    eventType: string;
    reason?: string;
    additionalFields?: Record<string, unknown>;
  }): SplunkHecEvent {
    const cimEvent: SplunkCimAuthEvent = {
      action: params.action,
      app: "ory-network",
      src: params.sourceIp,
      dest: this.config.host,
      user: params.userEmail,
      src_user: params.userId,
      authentication_method: params.authMethod,
      signature: params.eventType,
      signature_id: "",
      reason: params.reason,
      ...params.additionalFields,
    };

    return {
      time: Math.floor(Date.now() / 1000),
      host: this.config.host,
      source: this.config.source,
      sourcetype: this.config.sourcetype,
      index: this.config.index,
      event: cimEvent,
    };
  }

  private async send(payload: string): Promise<void> {
    const url = `${this.config.hecUrl}/services/collector/event`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Splunk ${this.config.hecToken}`,
        },
        body: payload,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn(`Splunk HEC error: ${res.status} - ${text}`);
      }
    } catch (err) {
      // Fire-and-forget: log but don't throw
      console.warn(`Splunk HEC request failed: ${(err as Error).message}`);
    }
  }
}
