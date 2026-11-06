// The Makefile side of the four targets of US-DEV-01 (db-reset, db-seed, pokedex-build, clean-ports): each exists with a help
// sentence and is declared in .PHONY, the local-only guard runs before any database change, and db-down removes the volume.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const makefile = readFileSync(new URL("../../../../Makefile", import.meta.url), "utf8");
const lines = makefile.split("\n");
const TARGETS = ["db-reset", "db-seed", "pokedex-build", "clean-ports"];

// The recipe lines of a target: the tab-indented lines after `name:` up to the next line that is not indented.
function recipeOf(name) {
  const start = lines.findIndex((l) => l.startsWith(`${name}:`));
  assert.ok(start >= 0, `target ${name} is missing in the Makefile`);
  const body = [];
  for (let i = start + 1; i < lines.length && lines[i].startsWith("\t"); i++) body.push(lines[i]);
  return body.join("\n");
}

test("US-DEV-01 the four targets exist, are declared in .PHONY and have a help sentence", () => {
  const phony = lines.find((l) => l.startsWith(".PHONY:")).split(/\s+/);
  for (const name of TARGETS) {
    assert.ok(phony.includes(name), `${name} is not in .PHONY`);
    const header = lines.find((l) => l.startsWith(`${name}:`));
    assert.ok(header, `${name} has no target line`);
    assert.ok(header.split("## ")[1]?.trim(), `${name} has no help sentence after ##`);
  }
});

test("US-DEV-01 db-down removes the test database with its volume, so a reset starts empty", () => {
  assert.match(recipeOf("db-down"), /docker rm -f -v \$\(DB_CONTAINER\)/);
});

test("US-DEV-01 db-reset checks the database before it removes anything", () => {
  const recipe = recipeOf("db-reset");
  const guard = recipe.indexOf("local-database.mjs");
  assert.ok(guard >= 0, "db-reset does not run the local-only guard");
  for (const change of ["db-down", "db-up", "migrate"]) {
    const at = recipe.indexOf(change);
    assert.ok(at > guard, `${change} runs before the guard`);
  }
});

test("US-DEV-01 db-seed and pokedex-build check the database before they write to it", () => {
  for (const name of ["db-seed", "pokedex-build"]) {
    const recipe = recipeOf(name);
    const guard = recipe.indexOf("local-database.mjs");
    assert.ok(guard >= 0, `${name} does not run the local-only guard`);
    const write = recipe.search(/seed:demo|taxonomy:build|npm run migrate/);
    assert.ok(write > guard, `${name} writes before the guard`);
  }
});

test("US-DEV-01 the local-only targets name this worktree's database, not a value taken from another checkout", () => {
  for (const name of ["db-reset", "db-seed", "pokedex-build"]) {
    assert.match(recipeOf(name), /local-database\.mjs \$\(PFLANZENDEX_TEST_DATABASE_URL\)/, name);
  }
});
