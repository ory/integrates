/** Segment identify call */
export interface SegmentIdentifyPayload {
  type: "identify";
  userId: string;
  traits: Record<string, unknown>;
  timestamp: string;
  messageId: string;
  context: {
    library: { name: string; version: string };
    ip?: string;
    userAgent?: string;
  };
}

/** Segment track call */
export interface SegmentTrackPayload {
  type: "track";
  userId: string;
  event: string;
  properties: Record<string, unknown>;
  timestamp: string;
  messageId: string;
  context: {
    library: { name: string; version: string };
    ip?: string;
    userAgent?: string;
  };
}

/** Segment batch API request */
export interface SegmentBatchPayload {
  batch: Array<SegmentIdentifyPayload | SegmentTrackPayload>;
  sentAt: string;
}

/** Ory webhook payload */
export interface OryWebhookPayload {
  identity: {
    id: string;
    traits: {
      email: string;
      name?: { first?: string; last?: string };
      [key: string]: unknown;
    };
    metadata_public?: Record<string, unknown>;
    created_at?: string;
  };
  flow: {
    id: string;
    type: string;
  };
  request_headers?: Record<string, string[]>;
  request_url?: string;
}
