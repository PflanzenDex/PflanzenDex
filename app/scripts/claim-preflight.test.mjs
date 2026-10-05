// US-DEV-08: preflight of `make claim` runs before any write
import test from "node:test";
import assert from "node:assert/strict";
import { preflight, PreflightFailed } from "./claim-preflight.mjs";

const okClient = {
  async run() {
    return "";
  },
};

test("US-DEV-08: preflight passes when node_modules and the Makefile on origin/dev exist", async () => {
  await preflight(okClient, { depsProblems: [] });
});

test("US-DEV-08: missing node_modules fails the preflight and names make setup", async () => {
  await assert.rejects(
    preflight(okClient, { depsProblems: ["node_modules missing: run `make setup` first"] }),
    (e) => e instanceof PreflightFailed && /make setup/.test(e.message),
  );
});

test("US-DEV-08: a stale checkout without Makefile on origin/dev fails the preflight", async () => {
  const client = {
    async run() {
      throw new Error("fatal: path 'Makefile' does not exist");
    },
  };
  await assert.rejects(preflight(client, { depsProblems: [] }), /origin\/dev/);
});
