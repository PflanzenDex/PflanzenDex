import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findLayout } from "../check/code/layout/layout-rules.mjs";
import { listPaths } from "../check/code/layout/check-layout.mjs";
import { fixDirectory } from "./layout-fix.mjs";

const WEB = "app/packages/web";
const config = {
  maxUnits: 5,
  rootFiles: [],
  rootDirs: ["app"],
  namedFiles: [],
  componentRoots: [`${WEB}/src`],
  componentExempt: ["main"],
  dirs: [{ path: `${WEB}/src/old`, collection: /^x$/ }],
};
const FILES = {
  [`${WEB}/tsconfig.json`]: '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }\n',
  [`${WEB}/src/kernel/index.ts`]: "export const k = 1;\n",
  [`${WEB}/src/mod/care-list.tsx`]:
    'import { api } from "./care-api";\nimport { k } from "@/kernel";\nexport const L = () => api + k;\n',
  [`${WEB}/src/mod/care-list.test.tsx`]: 'import { L } from "./care-list";\nexport const t = L;\n',
  [`${WEB}/src/mod/care-form.tsx`]: 'import { keys } from "./care-keys";\nexport const F = keys;\n',
  [`${WEB}/src/mod/care-api.ts`]: "export const api = 1;\n",
  [`${WEB}/src/mod/care-keys.ts`]: "export const keys = 2;\n",
  [`${WEB}/src/mod/a.ts`]: "export const a = 1;\n",
  [`${WEB}/src/mod/b.ts`]: "export const b = 1;\n",
  [`${WEB}/src/app.tsx`]:
    'import { L } from "./mod/care-list";\nimport { api } from "@/mod/care-api";\nexport const A = [L, api];\n',
  [`${WEB}/src/ui/CollectionPage.tsx`]:
    'import { Hints } from "./HintsPage";\nexport const C = Hints;\n',
  [`${WEB}/src/ui/HintsPage.tsx`]: "export const Hints = 1;\n",
  [`${WEB}/src/ui/index.ts`]: 'export { C } from "./CollectionPage";\n',
  [`${WEB}/vite.config.ts`]: 'export default { setup: "./src/mod/care-api.ts" };\n',
};

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "layout-fix-"));
  for (const [file, text] of Object.entries(FILES)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  const git = (...a) =>
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], {
      cwd: dir,
      stdio: "ignore",
    });
  git("init", "-q");
  git("add", "-A");
  git("commit", "-qm", "init");
  return { dir, remove: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const read = (dir, file) => fs.readFileSync(path.join(dir, file), "utf8");
const MOD = `${WEB}/src/mod`;

describe("US-QG-09 layout-fix: dry run and apply", () => {
  it("a dry run reports the moves and changes nothing", () => {
    const r = repo();
    try {
      const report = fixDirectory(r.dir, MOD, { apply: false, config });
      assert.ok(report.moves.size > 0);
      assert.ok(report.rewrittenFiles >= 1);
      assert.equal(read(r.dir, `${MOD}/care-list.tsx`).includes('"./care-api"'), true);
      assert.equal(fs.existsSync(path.join(r.dir, `${MOD}/care-list`)), false);
    } finally {
      r.remove();
    }
  });

  it("apply moves the files, keeps every import pointing at the same file and fixes the layout", () => {
    const r = repo();
    try {
      const report = fixDirectory(r.dir, MOD, { apply: true, config });
      assert.deepEqual(report.broken, []);
      assert.equal(fs.existsSync(path.join(r.dir, `${MOD}/care-list.tsx`)), false);
      const moved = [...report.moves.values()].find((p) => p.endsWith("care-list/care-list.tsx"));
      assert.ok(moved, "care-list.tsx lives in its own folder");
      assert.match(read(r.dir, "app/packages/web/src/app.tsx"), /from "\.\/mod\/[^"]*care-list"/);
      assert.match(read(r.dir, moved), /from "@\/kernel"/);
      assert.deepEqual(
        findLayout(listPaths(r.dir), config).filter(
          (f) => f.dir === MOD || f.dir.startsWith(`${MOD}/`),
        ),
        [],
      );
    } finally {
      r.remove();
    }
  });

  it("names other files that mention a moved path, because only imports are rewritten", () => {
    const r = repo();
    try {
      const report = fixDirectory(r.dir, MOD, { apply: false, config });
      assert.ok(report.mentions.some((m) => m.file === `${WEB}/vite.config.ts`));
    } finally {
      r.remove();
    }
  });

  it("does nothing for a directory that is a collection or already within the limit", () => {
    const r = repo();
    try {
      assert.equal(fixDirectory(r.dir, `${WEB}/src/kernel`, { apply: true, config }).moves.size, 0);
      assert.equal(fixDirectory(r.dir, `${WEB}/src/old`, { apply: true, config }).moves.size, 0);
    } finally {
      r.remove();
    }
  });

  it("--kebab renames PascalCase files and every import follows", () => {
    const r = repo();
    try {
      const ui = `${WEB}/src/ui`;
      const report = fixDirectory(r.dir, ui, { apply: true, config, kebab: true });
      assert.deepEqual(report.broken, []);
      assert.ok(fs.existsSync(path.join(r.dir, `${ui}/collection-page/collection-page.tsx`)));
      assert.match(
        read(r.dir, `${ui}/collection-page/collection-page.tsx`),
        /from "\.\.\/hints-page\/hints-page"/,
      );
      assert.match(read(r.dir, `${ui}/index.ts`), /from "\.\/collection-page\/collection-page"/);
      assert.deepEqual(
        findLayout(listPaths(r.dir), config).filter((f) => f.dir === ui),
        [],
      );
    } finally {
      r.remove();
    }
  });

  it("--into groups by meaning, and the check afterwards still resolves every import", () => {
    const r = repo();
    try {
      const report = fixDirectory(r.dir, MOD, {
        apply: true,
        config,
        auto: false,
        into: [{ folder: "care", prefixes: ["care-"] }],
      });
      assert.deepEqual(report.broken, []);
      assert.ok(fs.existsSync(path.join(r.dir, `${MOD}/care/care-api.ts`)));
      assert.ok(fs.existsSync(path.join(r.dir, `${MOD}/a.ts`)));
    } finally {
      r.remove();
    }
  });
});
