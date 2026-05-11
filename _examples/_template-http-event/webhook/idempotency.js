// SPDX-License-Identifier: Apache-2.0
//
// Minimal in-memory idempotency store. For production, replace with Redis
// (`SET NX EX <ttl>`) or DynamoDB (with TTL attribute) — both give you durability
// across restarts and survive horizontal scale-out.

const TTL_MS = 5 * 60 * 1000; // 5 minutes; tune to be longer than Ory's retry window
const seen = new Map();

// Returns true if the key is new (caller should proceed); false if already seen.
function remember(key) {
  const now = Date.now();
  for (const [k, expiresAt] of seen) {
    if (expiresAt < now) seen.delete(k);
  }
  if (seen.has(key)) return false;
  seen.set(key, now + TTL_MS);
  return true;
}

module.exports = { remember };
