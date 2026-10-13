// SPDX-License-Identifier: Apache-2.0
// Run after npm ci in each handler under test: node --test scripts/test-verification-integrations.cjs
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  loadWebhook,
  response,
  json,
} = require("./testing/webhook-fixture.cjs");
const file = (name) =>
  path.resolve(__dirname, `../identity-verification/${name}/webhook/server.ts`);
for (const [phone, expected] of [
  ["+15550000001", 200],
  ["+15550000002", 403],
]) {
  test(`Prove checks the SDK phone number: ${expected}`, async () => {
    const routes = loadWebhook(file("prove"), {
      prove: {
        async v3GetIdentity() {
          return {
            httpMeta: {},
            v3GetIdentityResponse: {
              active: true,
              phoneNumber: "+15550000001",
            },
          };
        },
      },
    });
    const res = response();
    await routes.get("/prove/validate")(
      { body: { prove_identity_id: "prove-id", phone_number: phone } },
      res,
    );
    assert.equal(res.code, expected);
    if (expected === 403)
      assert.match(res.body.messages[0].messages[0].text, /phone number/);
  });
}
test("Persona builds a usable hosted URL from the documented inquiry response", async () => {
  let request;
  const routes = loadWebhook(file("persona"), {
    fetch: async (_url, init) => {
      request = JSON.parse(init.body);
      return json({
        data: { id: "inq_fixture", attributes: { status: "created" } },
      });
    },
  });
  const res = response();
  await routes.get("/persona/initiate")(
    { body: { kratos_identity_id: "identity-id", email: "a@example.com" } },
    res,
  );
  assert.equal(res.code, 200);
  assert.equal(
    res.body.verification_url,
    "https://inquiry.withpersona.com/verify?inquiry-id=inq_fixture",
  );
  assert.equal(
    request.data.attributes.fields["email-address"],
    "a@example.com",
  );
  assert.equal(request.data.attributes["inquiry-type"], undefined);
});
test("Persona metadata patches preserve an unrelated update made after the GET", async () => {
  let metadata = { existing: true };
  const routes = loadWebhook(file("persona"), {
    fetch: async () =>
      json({ data: { id: "inq_fixture", attributes: { status: "created" } } }),
    sdk: {
      IdentityApi: class {
        async getIdentity() {
          const snapshot = { ...metadata };
          metadata.stripe = { customer_id: "cus_fixture" };
          return { data: { metadata_public: snapshot, metadata_admin: {} } };
        }
        async patchIdentity({ jsonPatch }) {
          for (const op of jsonPatch) {
            assert.notEqual(op.path, "/metadata_public");
            if (op.path.startsWith("/metadata_public/"))
              metadata[op.path.split("/")[2]] = op.value;
          }
        }
      },
    },
  });
  await routes.get("/persona/initiate")(
    { body: { kratos_identity_id: "identity-id", email: "a@example.com" } },
    response(),
  );
  assert.equal(metadata.stripe.customer_id, "cus_fixture");
  assert.equal(metadata.persona_inquiry_id, "inq_fixture");
});
test("Metadata initialization retries a stale updated_at test and preserves existing keys", async () => {
  let reads = 0,
    patches = 0;
  const routes = loadWebhook(file("persona"), {
    fetch: async () =>
      json({ data: { id: "inq_fixture", attributes: { status: "created" } } }),
    sdk: {
      IdentityApi: class {
        async getIdentity() {
          reads++;
          return {
            data: {
              updated_at: "2026-01-01T00:00:00Z",
              metadata_public:
                reads === 1 ? null : { stripe: { customer_id: "cus_fixture" } },
              metadata_admin: {},
            },
          };
        }
        async patchIdentity({ jsonPatch }) {
          patches++;
          if (patches === 1) {
            assert.equal(jsonPatch[0].op, "test");
            throw {
              response: {
                status: 400,
                data: { reason: "failed to apply JSON patch" },
              },
            };
          }
          assert.ok(jsonPatch.every((op) => op.path !== "/metadata_public"));
        }
      },
    },
  });
  const res = response();
  await routes.get("/persona/initiate")(
    { body: { kratos_identity_id: "identity-id", email: "a@example.com" } },
    res,
  );
  assert.equal(res.code, 200);
  assert.equal(reads, 2);
  assert.equal(patches, 2);
});
test("Socure retries callbacks that arrive before the external ID is persisted", async () => {
  let saved = false,
    patches = 0;
  const routes = loadWebhook(file("socure"), {
    env: {
      SOCURE_API_KEY: "fixture",
      SOCURE_CALLBACK_SECRET: "fixture",
      ORY_SDK_URL: "https://ory.test",
      ORY_ADMIN_API_KEY: "fixture",
    },
    fetch: async (_url, init) => {
      if (init.method === "PATCH") {
        patches++;
        return json({});
      }
      return saved ? json({ id: "identity-id" }) : json({}, 404);
    },
  });
  const rawBody = Buffer.from(
    JSON.stringify({ customerUserId: "external-id", decision: "reject" }),
  );
  const req = {
    body: JSON.parse(rawBody),
    rawBody,
    header: () =>
      crypto.createHmac("sha256", "fixture").update(rawBody).digest("hex"),
  };
  const early = response();
  await routes.get("/socure/results-callback")(req, early);
  assert.equal(early.code, 500);
  assert.equal(patches, 0);
  saved = true;
  const retry = response();
  await routes.get("/socure/results-callback")(req, retry);
  assert.equal(retry.code, 200);
  assert.equal(patches, 1);
});
test("reCAPTCHA denies missing tokens with detailed Kratos messages", async () => {
  const routes = loadWebhook(
    path.resolve(
      __dirname,
      "../fraud-bot-protection/recaptcha/webhook/server.ts",
    ),
    { env: { RECAPTCHA_SECRET_KEY: "fixture" } },
  );
  const res = response();
  await routes.get("/recaptcha/verify")(
    { body: { flow: { transient_payload: null } } },
    res,
  );
  assert.equal(res.code, 400);
  assert.equal(res.body.messages[0].instance_ptr, "#/");
  assert.equal(res.body.messages[0].messages[0].type, "error");
});
