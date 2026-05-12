# Split.io

> **Maintained by:** Community contributors

[Split.io](https://www.split.io) is a feature delivery platform — feature flags combined with metric-driven impact measurement. This integration passes Ory identity attributes (traits + subscription tier + organization + groups) to Split as user properties so feature rollouts can target by identity attributes.

**Type:** sdk-client (Split.io SDK in your application, fed Ory identity attributes — same pattern as `feature-flags/launchdarkly`)
**Docs page:** No dedicated Split.io page on ory.com/docs.

## How it works

This is **not a webhook integration** — feature evaluation happens in your application via the Split.io SDK. The integration is the convention for what to pass:

```typescript
// In your app, after Ory session resolution:
const session = await ory.sessions.toSession();
const identity = session.data.identity;

const attributes = {
  email: identity.traits.email,
  org_id: identity.metadata_public?.org_id,
  subscription_tier: identity.metadata_public?.recurly?.subscription_tier,
  // ...
};

const treatment = splitClient.getTreatment(identity.id, "my-feature", attributes);
```

## What to pass to Split

| Ory source | Split attribute | Use case |
| --- | --- | --- |
| `identity.id` | `key` | Stable bucketing — same user gets same treatment across sessions |
| `identity.traits.email` | `email` | Per-email overrides for internal testing |
| `metadata_public.org_id` | `org_id` | Per-organization rollouts (B2B SaaS) |
| `metadata_public.subscription_tier` | `tier` | Tier-gated features |
| `metadata_public.groups` | `groups` | Role-based feature access |

## Notable

- Pass **stable identifiers** as the `key` (use `identity.id`, not email — email can change).
- For server-side evaluation, use the Split server SDK; for client-side, use the Split JavaScript SDK and pass attributes via the `Track` API.
- Split's **Impact measurement** features need event-stream integration too — that's a separate concern; see [`cdp-analytics/segment`](../../cdp-analytics/segment/) for event ingestion patterns.
- Compare with [`feature-flags/launchdarkly`](../launchdarkly/) — same pattern, different vendor.

## Status

Community / proposed — no dedicated Ory documentation. Convention guide, not turnkey code.

## License

Apache-2.0. (Configuration / convention — no source code in this directory.)
