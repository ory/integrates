// SPDX-License-Identifier: Apache-2.0
// Execute the actual handlers with isolated vendor/Admin API fixtures.
const fs = require("node:fs");
const vm = require("node:vm");
const { createRequire } = require("node:module");
function loadWebhook(file, options = {}) {
  const localRequire = createRequire(file);
  const ts = localRequire("typescript");
  const routes = new Map();
  const app = {
    use() {},
    get() {},
    listen() {},
    post(path, ...handlers) {
      routes.set(path, handlers.at(-1));
    },
  };
  const express = Object.assign(() => app, {
    json: () => () => {},
    raw: () => () => {},
  });
  const sdk = {
    Configuration: class {},
    IdentityApi: class {
      async getIdentity() {
        return {
          data: {
            metadata_public: {},
            metadata_admin: {},
            updated_at: "2026-01-01T00:00:00Z",
          },
        };
      }
      async patchIdentity(data) {
        options.patches?.push(data);
      }
    },
    JsonPatchOpEnum: { Add: "add", Test: "test" },
    ...options.sdk,
  };
  const env = {
    ORY_WEBHOOK_SECRET: "fixture",
    KRATOS_ADMIN_URL: "https://ory.test",
    ORY_API_KEY: "fixture",
    PROVE_CLIENT_ID: "fixture",
    PROVE_CLIENT_SECRET: "fixture",
    PERSONA_API_KEY: "fixture",
    PERSONA_TEMPLATE_ID: "itmpl_fixture",
    PERSONA_WEBHOOK_SECRET: "fixture",
    ...options.env,
  };
  const context = {
    require(name) {
      if (name === "express") return express;
      if (name === "dotenv/config") return {};
      if (name === "@ory/client") return sdk;
      if (name === "@prove-identity/prove-api")
        return {
          Proveapi: class {
            identity = options.prove;
          },
        };
      return localRequire(name);
    },
    exports: {},
    process: {
      env,
      exit() {
        throw new Error("Unexpected process.exit");
      },
    },
    console: { log() {}, warn() {}, error() {} },
    Buffer,
    URL,
    URLSearchParams,
    AbortSignal,
    fetch:
      options.fetch ??
      (() => {
        throw new Error("Unexpected network call");
      }),
  };
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(source, context, { filename: file });
  return routes;
}
function response() {
  return {
    code: 200,
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}
function json(body, status = 200) {
  return Response.json(body, { status });
}
module.exports = { loadWebhook, response, json };
