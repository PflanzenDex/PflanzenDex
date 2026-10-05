import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planMoves } from "./fix-plan.mjs";

const opts = { maxUnits: 5, componentRoots: ["app/web/src"], componentExempt: ["main", "routes"] };
const at = (dir, names) => names.map((n) => `${dir}/${n}`);
const plan = (paths, dir, o = {}) => Object.fromEntries(planMoves(paths, dir, { ...opts, ...o }));

describe("US-QG-09 layout-fix: component folders (LY-4)", () => {
  const dir = "app/web/src/ui";
  it("moves a component with its test and story into a folder of its name", () => {
    const paths = at(dir, ["badge.tsx", "badge.test.tsx", "badge.stories.tsx", "util.ts"]);
    assert.deepEqual(plan(paths, dir), {
      [`${dir}/badge.tsx`]: `${dir}/badge/badge.tsx`,
      [`${dir}/badge.test.tsx`]: `${dir}/badge/badge.test.tsx`,
      [`${dir}/badge.stories.tsx`]: `${dir}/badge/badge.stories.tsx`,
    });
  });
  it("does nothing outside the component roots, for exempt entry points and for components already in a folder", () => {
    assert.deepEqual(plan(at("app/core/src/ui", ["badge.tsx"]), "app/core/src/ui"), {});
    assert.deepEqual(plan(at(dir, ["main.tsx", "routes.tsx"]), dir), {});
    assert.deepEqual(
      plan(at("app/web/src/ui/badge", ["badge.tsx", "badge.test.tsx"]), "app/web/src/ui/badge"),
      {},
    );
  });
});

describe("US-QG-09 layout-fix: grouping by name prefix (LY-1)", () => {
  const dir = "app/core/src/mod";
  const names = [
    "care-a.ts",
    "care-b.ts",
    "care-c.ts",
    "user-a.ts",
    "user-b.ts",
    "misc.ts",
    "zeta.ts",
    "alpha.ts",
  ];
  it("groups the biggest prefixes until the directory is within the limit", () => {
    const moves = plan(at(dir, names), dir);
    assert.deepEqual(
      Object.keys(moves).sort(),
      at(dir, ["care-a.ts", "care-b.ts", "care-c.ts", "user-a.ts", "user-b.ts"]).sort(),
    );
    assert.equal(moves[`${dir}/care-a.ts`], `${dir}/care/care-a.ts`);
    assert.equal(moves[`${dir}/user-b.ts`], `${dir}/user/user-b.ts`);
  });
  it("does nothing when the directory is already within the limit", () => {
    assert.deepEqual(plan(at(dir, ["a-1.ts", "a-2.ts", "b.ts"]), dir), {});
  });
  it("moves a test with the unit it belongs to", () => {
    const paths = at(dir, [
      "care-a.ts",
      "care-a.test.ts",
      "care-b.ts",
      "x.ts",
      "y.ts",
      "z.ts",
      "w.ts",
    ]);
    const moves = plan(paths, dir);
    assert.equal(moves[`${dir}/care-a.test.ts`], `${dir}/care/care-a.test.ts`);
    assert.equal(Object.keys(moves).length, 3);
  });
  it("moves a whole subdirectory when it is part of a group", () => {
    const paths = [
      ...at(dir, ["care-a.ts", "care-b.ts", "x.ts", "y.ts", "z.ts"]),
      `${dir}/care-old/one.ts`,
      `${dir}/care-old/two.ts`,
    ];
    const moves = plan(paths, dir);
    assert.equal(moves[`${dir}/care-old/one.ts`], `${dir}/care/care-old/one.ts`);
    assert.equal(moves[`${dir}/care-a.ts`], `${dir}/care/care-a.ts`);
  });
  it("skips a prefix that equals the name of an existing unit", () => {
    const paths = at(dir, ["care.ts", "care-a.ts", "care-b.ts", "care-c.ts", "x.ts", "y.ts"]);
    assert.deepEqual(plan(paths, dir), {});
  });
  it("splits a new folder again when it is still too big", () => {
    const paths = at("app/core/src/m", ["a-b-1.ts", "a-b-2.ts", "a-c-1.ts", "a-c-2.ts", "z.ts"]);
    const moves = plan(paths, "app/core/src/m", { maxUnits: 2 });
    assert.equal(moves["app/core/src/m/a-b-1.ts"], "app/core/src/m/a/b/a-b-1.ts");
    assert.equal(moves["app/core/src/m/a-c-2.ts"], "app/core/src/m/a/c/a-c-2.ts");
    assert.equal(moves["app/core/src/m/z.ts"], undefined);
  });
});

describe("US-QG-09 layout-fix: components inside groups stay in their own folder", () => {
  it("first gives components a folder, then groups the folders", () => {
    const dir = "app/web/src/mod";
    const paths = at(dir, [
      "care-list.tsx",
      "care-list.test.tsx",
      "care-form.tsx",
      "care-api.ts",
      "x.ts",
      "y.ts",
      "z.ts",
    ]);
    const moves = plan(paths, dir);
    assert.equal(moves[`${dir}/care-list.tsx`], `${dir}/care/care-list/care-list.tsx`);
    assert.equal(moves[`${dir}/care-form.tsx`], `${dir}/care/care-form/care-form.tsx`);
    assert.equal(moves[`${dir}/care-api.ts`], `${dir}/care/care-api.ts`);
  });
});

describe("US-QG-09 layout-fix: the directory name is not repeated as a folder", () => {
  it("skips the prefix that the directory already carries", () => {
    const dir = "app/core/src/care";
    const paths = at(dir, [
      "care-phases-api.ts",
      "care-phases-list.ts",
      "care-form.ts",
      "a.ts",
      "b.ts",
      "c.ts",
    ]);
    const moves = plan(paths, dir);
    assert.equal(moves[`${dir}/care-phases-api.ts`], `${dir}/phases/care-phases-api.ts`);
    assert.equal(moves[`${dir}/care-phases-list.ts`], `${dir}/phases/care-phases-list.ts`);
    assert.equal(moves[`${dir}/care-form.ts`], undefined);
  });
});

describe("US-QG-09 layout-fix: kebab-case names (LY-3)", () => {
  const dir = "app/web/src/ui";
  it("renames PascalCase files and gives the components their folder under the new name", () => {
    const paths = at(dir, [
      "CollectionPage.tsx",
      "CollectionPage.test.tsx",
      "HintsPage.skeleton.tsx",
      "index.ts",
    ]);
    assert.deepEqual(plan(paths, dir, { kebab: true }), {
      [`${dir}/CollectionPage.tsx`]: `${dir}/collection-page/collection-page.tsx`,
      [`${dir}/CollectionPage.test.tsx`]: `${dir}/collection-page/collection-page.test.tsx`,
      [`${dir}/HintsPage.skeleton.tsx`]: `${dir}/hints-page/hints-page.skeleton.tsx`,
    });
  });
  it("only renames when asked and leaves conventional names alone", () => {
    assert.deepEqual(plan(at("app/core/src/m", ["CamelCase.ts"]), "app/core/src/m"), {});
    assert.deepEqual(
      plan(at("app/core/src/m", ["README.md"]), "app/core/src/m", {
        kebab: true,
        namedFiles: ["README.md"],
      }),
      {},
    );
  });
  it("splits camel case and acronyms the way a person would", () => {
    const moves = plan(
      at("app/core/src/m", ["ApiError.ts", "HTTPServer.ts", "snake_case.ts"]),
      "app/core/src/m",
      { kebab: true },
    );
    assert.equal(moves["app/core/src/m/ApiError.ts"], "app/core/src/m/api-error.ts");
    assert.equal(moves["app/core/src/m/HTTPServer.ts"], "app/core/src/m/http-server.ts");
    assert.equal(moves["app/core/src/m/snake_case.ts"], "app/core/src/m/snake-case.ts");
  });
});

describe("US-QG-09 layout-fix: explicit groups chosen by a person", () => {
  const dir = "app/core/src/mod";
  const paths = at(dir, [
    "archive.ts",
    "archived.ts",
    "archive.test.ts",
    "cards.ts",
    "x.ts",
    "y.ts",
    "z.ts",
  ]);
  it("moves the units that start with one of the prefixes into the named folder", () => {
    const moves = plan(paths, dir, {
      into: [{ folder: "archive", prefixes: ["archive"] }],
      auto: false,
    });
    assert.deepEqual(
      Object.keys(moves).sort(),
      at(dir, ["archive.test.ts", "archive.ts", "archived.ts"]).sort(),
    );
    assert.equal(moves[`${dir}/archived.ts`], `${dir}/archive/archived.ts`);
    assert.equal(moves[`${dir}/archive.ts`], `${dir}/archive/archive.ts`);
  });
  it("lets the automatic grouping finish the job unless it is switched off", () => {
    const more = at(dir, ["a-1.ts", "a-2.ts", "a-3.ts", "m.ts", "n.ts", "o.ts", "p.ts"]);
    assert.ok(plan(more, dir, { into: [], auto: true })[`${dir}/a-1.ts`]);
    assert.deepEqual(plan(more, dir, { into: [], auto: false }), {});
  });
});
