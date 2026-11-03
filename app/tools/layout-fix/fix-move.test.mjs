import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fixMoves, planExplicitMoves } from "./fix-move.mjs";

// FR-QG-23: move mode (`--move <from>=<to>`) on a temporary git repository.
const WEB = "app/packages/web";
const S = `${WEB}/src`;
const FILES = {
  [`${WEB}/tsconfig.json`]: '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }\n',
  [`${S}/lib/utils.ts`]: "export const u = 1;\n",
  [`${S}/lib/utils.test.ts`]: 'import { u } from "./utils";\nexport const t = u;\n',
  [`${S}/lib/text/rules.ts`]: 'import { u } from "../utils";\nexport const r = u;\n',
  [`${S}/lib/text/index.ts`]: 'export { r } from "./rules";\n',
  [`${S}/care/form.tsx`]:
    'import { u } from "@/lib/utils";\nimport { r } from "../lib/text";\nexport const F = [u, r];\n',
  [`${S}/main.tsx`]: 'import { F } from "./care/form";\nexport const m = F;\n',
};

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fix-move-"));
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

describe("FR-QG-23 layout-fix move mode", () => {
  it("FR-QG-23: a dry run prints the plan and changes nothing", () => {
    const r = repo();
    try {
      const out = fixMoves(r.dir, [`${S}/lib/utils.ts=${S}/shared/utils.ts`]);
      assert.equal(out.moves.get(`${S}/lib/utils.ts`), `${S}/shared/utils.ts`);
      assert.ok(out.edits >= 3 && out.broken.length === 0);
      assert.ok(fs.existsSync(path.join(r.dir, `${S}/lib/utils.ts`)));
      assert.equal(read(r.dir, `${S}/lib/utils.test.ts`).includes("./utils"), true);
    } finally {
      r.remove();
    }
  });

  it("FR-QG-23: a file move rewrites relative and @/ alias imports in moved and other files", () => {
    const r = repo();
    try {
      const out = fixMoves(r.dir, [`${S}/lib/utils.ts=${S}/shared/utils.ts`], { apply: true });
      assert.equal(out.broken.length, 0);
      assert.ok(fs.existsSync(path.join(r.dir, `${S}/shared/utils.ts`)));
      assert.match(read(r.dir, `${S}/care/form.tsx`), /from "@\/shared\/utils"/);
      assert.match(read(r.dir, `${S}/lib/utils.test.ts`), /from "\.\.\/shared\/utils"/);
      assert.match(read(r.dir, `${S}/lib/text/rules.ts`), /from "\.\.\/\.\.\/shared\/utils"/);
      const status = execFileSync("git", ["status", "--short"], { cwd: r.dir, encoding: "utf8" });
      assert.match(status, /^R /m); // moved with git mv
    } finally {
      r.remove();
    }
  });

  it("FR-QG-23: a directory move keeps imports inside the directory and rewrites the outside ones", () => {
    const r = repo();
    try {
      const out = fixMoves(r.dir, [`${S}/lib/text=${S}/shared/patterns/text`], { apply: true });
      assert.equal(out.broken.length, 0);
      assert.equal(out.moves.size, 2);
      assert.match(read(r.dir, `${S}/shared/patterns/text/index.ts`), /from "\.\/rules"/);
      assert.match(
        read(r.dir, `${S}/shared/patterns/text/rules.ts`),
        /from "\.\.\/\.\.\/\.\.\/lib\/utils"/,
      );
      assert.match(read(r.dir, `${S}/care/form.tsx`), /from "\.\.\/shared\/patterns\/text"/);
    } finally {
      r.remove();
    }
  });

  it("FR-QG-23: several --move pairs together, and a moved importer and target at once", () => {
    const r = repo();
    try {
      fixMoves(r.dir, [`${S}/care=${S}/app/care`, `${S}/lib/utils.ts=${S}/shared/utils.ts`], {
        apply: true,
      });
      assert.match(read(r.dir, `${S}/app/care/form.tsx`), /from "@\/shared\/utils"/);
      assert.match(read(r.dir, `${S}/app/care/form.tsx`), /from "\.\.\/\.\.\/lib\/text"/);
      assert.match(read(r.dir, `${S}/main.tsx`), /from "\.\/app\/care\/form"/);
    } finally {
      r.remove();
    }
  });

  it("FR-QG-23: plan errors for a missing source, an existing target and a move into itself", () => {
    const paths = Object.keys(FILES);
    assert.throws(() => planExplicitMoves(paths, [`${S}/nope=${S}/x`]), /nothing to move/);
    assert.throws(
      () => planExplicitMoves(paths, [`${S}/lib/utils.ts=${S}/main.tsx`]),
      /already exists/,
    );
    assert.throws(() => planExplicitMoves(paths, [`${S}/lib=${S}/lib/inner`]), /into itself/);
    assert.throws(() => planExplicitMoves(paths, ["only-one-side"]), /needs <from>=<to>/);
  });
});
