import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { checkProject, importsOf, walkCode } from "../../check-boundaries.mjs";
import { webLayerFindings, webLayerOf } from "./check-modules-graph.mjs";

// AB-15 (FR-QG-23, blocking since step 5): shared imports no module and not app, a module imports not app.
const cfg = { MODULES: ["kernel", "care", "pokedex"].map((name) => ({ name })) };
const W = "packages/web/src";
const files = {
  [`${W}/shared/ui/button.tsx`]: "export const B = 1;\n",
  [`${W}/care/index.ts`]: "export const c = 1;\n",
  [`${W}/care/form.tsx`]:
    'import { B } from "@/shared/ui/button";\nimport { x } from "../pokedex";\n',
  [`${W}/pokedex/index.ts`]: "export const x = 1;\n",
  [`${W}/app/routes.tsx`]:
    'import { c } from "../care";\nimport { B } from "../shared/ui/button";\n',
  [`${W}/app/a.ts`]: 'import { B } from "../shared/ui/button";\n',
};
function tree(patch = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "web-layers-"));
  for (const [rel, text] of Object.entries({ ...files, ...patch })) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}
const findings = (patch) =>
  webLayerFindings({ appDir: tree(patch), cfg, h: { walkCode, importsOf } });

describe("FR-QG-23 AB-15 web layers", () => {
  it("FR-QG-23 AB-15: a clean tree has no finding (app -> modules -> shared)", () =>
    assert.deepEqual(findings(), []));

  it("FR-QG-23 AB-15: shared importing a module is reported with rule, file and line", () => {
    const v = findings({ [`${W}/shared/ui/card.tsx`]: '\nimport { c } from "../../care";\n' });
    assert.deepEqual(v, [`AB-15 ${W}/shared/ui/card.tsx:2 shared -> module care: "../../care"`]);
  });

  it("FR-QG-23 AB-15: shared importing app through the @/ alias", () => {
    const v = findings({ [`${W}/shared/ui/card.tsx`]: 'import { r } from "@/app/routes";\n' });
    assert.match(v[0] ?? "", /^AB-15 .*card\.tsx:1 shared -> app: "@\/app\/routes"/);
  });

  it("FR-QG-23 AB-15: a module importing app, and a root file counts as app", () => {
    const v = findings({
      [`${W}/care/x.ts`]: 'import { t } from "../title";\n',
      [`${W}/title.ts`]: "export const t = 1;\n",
    });
    assert.match(v[0] ?? "", /^AB-15 .*care\/x\.ts:1 module care -> app: "\.\.\/title"/);
  });

  it("FR-QG-23 AB-15: the current folders map to their target layers", () => {
    const m = cfg.MODULES;
    assert.equal(webLayerOf("shared/ui/button/button.tsx", m), "shared");
    assert.equal(webLayerOf("shared/patterns/navigation/page-header/x.tsx", m), "shared");
    assert.equal(webLayerOf("app/frame/side-nav/x.tsx", m), "app");
    assert.equal(webLayerOf("pokedex/pokedex-cards/collector-cards/x.tsx", m), "pokedex");
    assert.equal(webLayerOf("app/destinations/x.tsx", m), "app");
    assert.equal(webLayerOf("app/flows/unlock/x.tsx", m), "app");
    assert.equal(webLayerOf("shared/data/index.ts", m), "shared");
    assert.equal(webLayerOf("main.tsx", m), "app");
    assert.equal(webLayerOf("care/form.tsx", m), "care");
  });

  it("FR-QG-23 AB-15 blocks: check-boundaries lists the finding as a violation", () => {
    const dir = tree({ [`${W}/shared/ui/card.tsx`]: 'import { r } from "@/app/routes";\n' });
    const v = checkProject(dir).filter((l) => l.startsWith("AB-15"));
    assert.deepEqual(v, [`AB-15 ${W}/shared/ui/card.tsx:1 shared -> app: "@/app/routes"`]);
  });

  it("FR-QG-23 AB-15 blocks: a clean web tree adds no violation", () =>
    assert.deepEqual(
      checkProject(tree()).filter((l) => l.startsWith("AB-15")),
      [],
    ));
});
