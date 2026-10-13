// SPDX-License-Identifier: Apache-2.0
// Run after npm ci in each handler under test: node --test scripts/test-webhook-integrations.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  loadWebhook,
  response,
  json,
} = require("./testing/webhook-fixture.cjs");
const configurations = {
  svix: {
    file: "webhook-infrastructure/svix/webhook/server.ts",
    route: "/svix/login",
    env: { SVIX_API_KEY: "fixture", SVIX_APP_ID: "fixture" },
  },
  splunk: {
    file: "siem-security-analytics/splunk/webhook/server.ts",
    route: "/splunk/login",
    env: { SPLUNK_HEC_URL: "https://splunk.test", SPLUNK_HEC_TOKEN: "fixture" },
  },
  clearbit: {
    file: "user-enrichment/clearbit/webhook/server.ts",
    route: "/clearbit/registration",
    env: {
      CLEARBIT_API_KEY: "fixture",
      ORY_SDK_URL: "https://ory.test",
      ORY_ADMIN_API_KEY: "fixture",
    },
  },
  segment: {
    file: "cdp-analytics/segment/webhook/server.ts",
    route: "/segment/login",
    env: { SEGMENT_WRITE_KEY: "fixture" },
  },
  pipedrive: {
    file: "crm/pipedrive/webhook/server.ts",
    route: "/pipedrive/sync-user",
    env: { PIPEDRIVE_API_TOKEN: "fixture" },
  },
};
const body = {
  id: "identity-id",
  traits: { email: "a@example.com" },
  identity: { id: "identity-id", traits: { email: "a@example.com" } },
  flow: { id: "flow-id" },
};
for (const [name, config] of Object.entries(configurations)) {
  test(`${name} returns a retryable response when its vendor is unavailable`, async () => {
    const routes = loadWebhook(path.resolve(__dirname, "..", config.file), {
      env: config.env,
      fetch: async () => json({}, 503),
    });
    const res = response();
    await routes.get(config.route)({ body, header: () => "trigger-id" }, res);
    assert.equal(res.code, 502);
  });
}
test("Svix acknowledges only after publishing, with a stable event ID", async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  let calls = [];
  const config = configurations.svix;
  const routes = loadWebhook(path.resolve(__dirname, "..", config.file), {
    env: config.env,
    fetch: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      await pending;
      return json({});
    },
  });
  const res = response();
  const delivery = routes.get(config.route)({ body }, res);
  assert.equal(res.body, undefined);
  release();
  await delivery;
  assert.equal(res.code, 200);
  await routes.get(config.route)({ body }, response());
  assert.equal(calls[0].eventId, calls[1].eventId);
});
test("Segment deduplicates partial registration delivery across Ory retries", async () => {
  const calls = [];
  let failTrack = true;
  const config = configurations.segment;
  const routes = loadWebhook(path.resolve(__dirname, "..", config.file), {
    env: config.env,
    fetch: async (url, init) => {
      calls.push(JSON.parse(init.body));
      return json({}, url.endsWith("/track") && failTrack ? 503 : 200);
    },
  });
  const req = { body, header: () => "stable-ory-trigger" };
  const first = response();
  await routes.get("/segment/registration")(req, first);
  assert.equal(first.code, 502);
  failTrack = false;
  const retry = response();
  await routes.get("/segment/registration")(req, retry);
  assert.equal(retry.code, 200);
  assert.equal(calls[0].messageId, calls[2].messageId);
  assert.equal(calls[1].messageId, calls[3].messageId);
});
test("Splunk rejects an HTTP 200 whose HEC result code signals failure", async () => {
  const config = configurations.splunk;
  const routes = loadWebhook(path.resolve(__dirname, "..", config.file), {
    env: config.env,
    fetch: async () => json({ code: 7 }),
  });
  const res = response();
  await routes.get(config.route)({ body }, res);
  assert.equal(res.code, 502);
});
test("Clearbit treats a vendor no-result response as successful completion", async () => {
  const config = configurations.clearbit;
  const routes = loadWebhook(path.resolve(__dirname, "..", config.file), {
    env: config.env,
    fetch: async () => json({}, 404),
  });
  const res = response();
  await routes.get(config.route)({ body }, res);
  assert.equal(res.code, 200);
});
