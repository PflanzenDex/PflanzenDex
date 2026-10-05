import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveSpecifier, buildSpecifier } from "./fix-resolve.mjs";

const files = new Set([
  "app/packages/web/src/care/care-page.tsx",
  "app/packages/web/src/care/api/query-keys.ts",
  "app/packages/web/src/kernel/index.ts",
  "app/packages/web/src/kernel/use-request.ts",
  "app/packages/web/src/styles/tokens.css",
  "app/packages/core/src/index.ts",
]);
const ctx = {
  files,
  aliases: [{ prefix: "@/", dir: "app/packages/web/src", scope: "app/packages/web/" }],
};
const from = "app/packages/web/src/care/care-page.tsx";

describe("US-QG-09 layout-fix: resolving a specifier", () => {
  it("resolves a relative specifier without extension", () => {
    assert.deepEqual(resolveSpecifier("./api/query-keys", from, ctx), {
      target: "app/packages/web/src/care/api/query-keys.ts",
      how: "ext",
    });
  });
  it("resolves a directory to its index file", () => {
    assert.deepEqual(resolveSpecifier("../kernel", from, ctx), {
      target: "app/packages/web/src/kernel/index.ts",
      how: "index",
    });
  });
  it("resolves an exact file name such as a stylesheet", () => {
    assert.deepEqual(resolveSpecifier("../styles/tokens.css", from, ctx), {
      target: "app/packages/web/src/styles/tokens.css",
      how: "exact",
    });
  });
  it("resolves the @/ alias only inside its package", () => {
    assert.equal(
      resolveSpecifier("@/kernel/use-request", from, ctx)?.target,
      "app/packages/web/src/kernel/use-request.ts",
    );
    assert.equal(resolveSpecifier("@/kernel", "app/packages/core/src/index.ts", ctx), null);
  });
  it("leaves package imports and unknown targets alone", () => {
    assert.equal(resolveSpecifier("@pflanzendex/core", from, ctx), null);
    assert.equal(resolveSpecifier("vitest", from, ctx), null);
    assert.equal(resolveSpecifier("./missing", from, ctx), null);
  });
});

describe("US-QG-09 layout-fix: building the new specifier", () => {
  const web = "app/packages/web/src";
  it("keeps a relative specifier relative and drops the extension the original did not have", () => {
    const res = resolveSpecifier("./api/query-keys", from, ctx);
    assert.equal(
      buildSpecifier(
        "./api/query-keys",
        res,
        { from: from, target: `${web}/care/queries/query-keys.ts` },
        ctx,
      ),
      "./queries/query-keys",
    );
  });
  it("recomputes the path when the importing file moves", () => {
    const res = resolveSpecifier("./api/query-keys", from, ctx);
    assert.equal(
      buildSpecifier(
        "./api/query-keys",
        res,
        { from: `${web}/care/care-page/care-page.tsx`, target: res.target },
        ctx,
      ),
      "../api/query-keys",
    );
  });
  it("keeps the alias style", () => {
    const res = resolveSpecifier("@/kernel/use-request", from, ctx);
    assert.equal(
      buildSpecifier(
        "@/kernel/use-request",
        res,
        { from: from, target: `${web}/kernel/request/use-request.ts` },
        ctx,
      ),
      "@/kernel/request/use-request",
    );
  });
  it("points a directory import at the directory again", () => {
    const res = resolveSpecifier("../kernel", from, ctx);
    assert.equal(
      buildSpecifier(
        "../kernel",
        res,
        { from: from, target: `${web}/shared/kernel/index.ts` },
        ctx,
      ),
      "../shared/kernel",
    );
  });
  it("keeps an explicit extension", () => {
    const res = resolveSpecifier("../styles/tokens.css", from, ctx);
    assert.equal(
      buildSpecifier(
        "../styles/tokens.css",
        res,
        { from: from, target: `${web}/theme/tokens.css` },
        ctx,
      ),
      "../theme/tokens.css",
    );
  });
});
