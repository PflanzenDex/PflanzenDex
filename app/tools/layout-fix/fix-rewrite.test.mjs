import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rewriteImports } from "./fix-rewrite.mjs";

const web = "app/packages/web/src";
const files = new Set([
  `${web}/care/care-page.tsx`,
  `${web}/care/care-page.test.tsx`,
  `${web}/care/query-keys.ts`,
  `${web}/care/phases.css`,
  `${web}/kernel/index.ts`,
]);
const ctx = { files, aliases: [{ prefix: "@/", dir: web, scope: "app/packages/web/" }] };
const moves = new Map([
  [`${web}/care/query-keys.ts`, `${web}/care/api/query-keys.ts`],
  [`${web}/care/phases.css`, `${web}/care/api/phases.css`],
]);
const stay = { old: `${web}/care/care-page.tsx`, now: `${web}/care/care-page.tsx` };

describe("US-QG-09 layout-fix: rewriting imports of a file", () => {
  it("rewrites every import form that points at a moved file", () => {
    const src = [
      'import { A } from "./query-keys";',
      'export * from "./query-keys";',
      'const m = await import("./query-keys");',
      'vi.mock("./query-keys", () => ({}));',
      'const real = await vi.importActual("./query-keys");',
      'type T = typeof import("./query-keys");',
      'import "./phases.css";',
    ].join("\n");
    const out = rewriteImports(src, stay, moves, ctx);
    assert.equal(out.count, 7);
    assert.equal(out.text.split("\n").filter((l) => l.includes("./api/query-keys")).length, 6);
    assert.ok(out.text.includes('import "./api/phases.css";'));
  });
  it("leaves everything else byte for byte, including the quote style", () => {
    const src =
      "import { x } from '../kernel';\nimport y from \"react\";\nconst s = 'from \"./nothing\"';\n";
    const out = rewriteImports(src, stay, moves, ctx);
    assert.equal(out.count, 0);
    assert.equal(out.text, src);
  });
  it("keeps single quotes and the alias style when it rewrites", () => {
    const out = rewriteImports("import { A } from '@/care/query-keys';", stay, moves, ctx);
    assert.equal(out.text, "import { A } from '@/care/api/query-keys';");
  });
  it("recomputes relative specifiers when the importing file moves", () => {
    const moved = { old: stay.old, now: `${web}/care/care-page/care-page.tsx` };
    const out = rewriteImports(
      'import { K } from "../kernel";\nimport { A } from "./query-keys";',
      moved,
      moves,
      ctx,
    );
    assert.equal(
      out.text,
      'import { K } from "../../kernel";\nimport { A } from "../api/query-keys";',
    );
    assert.equal(out.count, 2);
  });
  it("keeps the shape of a sibling import when both files move together", () => {
    const both = new Map([
      [`${web}/care/care-page.tsx`, `${web}/care/page/care-page.tsx`],
      [`${web}/care/care-page.test.tsx`, `${web}/care/page/care-page.test.tsx`],
    ]);
    const test = {
      old: `${web}/care/care-page.test.tsx`,
      now: `${web}/care/page/care-page.test.tsx`,
    };
    const out = rewriteImports('import { P } from "./care-page";', test, both, ctx);
    assert.equal(out.count, 0);
    assert.equal(out.text, 'import { P } from "./care-page";');
  });
});
