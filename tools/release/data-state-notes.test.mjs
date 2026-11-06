// US-DEV-06 (#1406): the release notes name the data state of the catalog and the taxonomy tree (FR-DEV-07). The rules are
// pure: the readings are injected, so the tests need neither a database nor a file.
import assert from "node:assert/strict";
import test from "node:test";
import config from "../../app/config/project/release.config.js";
import { generateNotes, parseDataState, readDataState, renderDataState } from "./data-state-notes.mjs";

const reading = {
  readAt: "2026-11-06T10:00:00Z",
  catalog: { approvedSpecies: 137 },
  tree: { builtAt: "2026-11-05T22:14:03Z", species: 130, errors: 7 },
};
const recorded = (value) => () => JSON.stringify(value);
const missing = () => {
  throw Object.assign(new Error("no such file"), { code: "ENOENT" });
};

test("US-DEV-06 a valid reading renders the catalog and the tree with their times and counts", () => {
  assert.equal(
    renderDataState(readDataState(recorded(reading))),
    [
      "### Data state",
      "",
      "- Catalog: 137 approved species, as of 2026-11-06T10:00:00Z.",
      "- Taxonomy tree: built at 2026-11-05T22:14:03Z; 130 species resolved, 7 errors (names the build could not resolve).",
    ].join("\n"),
  );
});

test("US-DEV-06 a tree that no build has stored yet says so and never shows a count", () => {
  const section = renderDataState(readDataState(recorded({ ...reading, tree: null })));
  assert.match(section, /^- Taxonomy tree: none stored yet, no build has run\.$/m);
  assert.match(section, /^- Catalog: 137 approved species, as of 2026-11-06T10:00:00Z\.$/m);
});

test("US-DEV-06 one error is written in the singular", () => {
  const section = renderDataState(
    readDataState(recorded({ ...reading, tree: { ...reading.tree, errors: 1 } })),
  );
  assert.match(section, /130 species resolved, 1 error \(names the build could not resolve\)\.$/m);
});

test("US-DEV-06 a missing record says unknown for both parts and guesses no count (P-08)", () => {
  const section = renderDataState(readDataState(missing));
  assert.equal(
    section,
    [
      "### Data state",
      "",
      "- Catalog: unknown (no reading recorded for this release).",
      "- Taxonomy tree: unknown (no reading recorded for this release).",
    ].join("\n"),
  );
  assert.doesNotMatch(section.replace("### Data state", ""), /\d/);
});

test("US-DEV-06 a record that cannot be read says unknown with the error code and does not throw", () => {
  const denied = () => {
    throw Object.assign(new Error("denied"), { code: "EACCES" });
  };
  assert.match(renderDataState(readDataState(denied)), /unknown \(the record cannot be read \(EACCES\)\)/);
});

test("US-DEV-06 an invalid record says unknown with the reason, so the release still runs and nothing disappears silently (P-10)", () => {
  const cases = [
    ["not json", "the record is not valid JSON"],
    [{ ...reading, readAt: "6.11.2026" }, "readAt is missing or not a UTC time stamp"],
    [{ ...reading, catalog: { approvedSpecies: "137" } }, "catalog.approvedSpecies is missing or not a count"],
    [{ ...reading, catalog: { approvedSpecies: -1 } }, "catalog.approvedSpecies is missing or not a count"],
    [{ ...reading, tree: { builtAt: reading.tree.builtAt, species: 130 } }, "tree is neither null nor a build"],
    [{ ...reading, tree: undefined }, "tree is neither null nor a build"],
  ];
  for (const [value, reason] of cases) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    const section = renderDataState(readDataState(() => text));
    assert.ok(section.includes(`unknown (${reason}`), `${reason} missing from: ${section}`);
  }
});

test("US-DEV-06 the release configuration loads this module as the notes plugin", () => {
  assert.ok(
    config.plugins.some((plugin) => typeof plugin === "string" && plugin.endsWith("tools/release/data-state-notes.mjs")),
    "release.config.js must list tools/release/data-state-notes.mjs as a plugin",
  );
});

test("US-DEV-06 the notes plugin exports generateNotes, the step semantic-release calls", () => {
  assert.equal(typeof generateNotes, "function");
  assert.match(generateNotes(), /^### Data state\n/);
});

test("US-DEV-06 parseDataState accepts a null tree as no build yet", () => {
  const result = parseDataState(JSON.stringify({ ...reading, tree: null }));
  assert.equal(result.ok, true);
  assert.equal(result.reading.tree, null);
});
