// Tests of the layout manifest (US-QG-09, FR-QG-21, LY-1a and LY-7, owner decision d-136): the frontmatter of a README.md.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isManifestPath, parseManifest } from "./layout-manifest.mjs";

describe("US-QG-09 LY-1a manifest frontmatter (d-136)", () => {
  it("a README.md without frontmatter is no manifest", () => {
    assert.deepEqual(parseManifest("# Plants\n\nText\n"), { state: "none" });
  });
  it("a frontmatter that is never closed is no manifest", () => {
    assert.deepEqual(parseManifest("---\ntopic: a\nwhy: b\nexpect: 25\n# Plants\n"), {
      state: "none",
    });
  });
  it("topic, why and expect make a manifest, and a colon may stand in the topic", () => {
    const text =
      "---\ntopic: Plant layer: the sheet and its tabs\nwhy: one feature, every tab belongs together\nexpect: 25\n---\n# Plant layer\n";
    assert.deepEqual(parseManifest(text), {
      state: "ok",
      topic: "Plant layer: the sheet and its tabs",
      why: "one feature, every tab belongs together",
      expect: 25,
    });
  });
  it("quoted values are read without their quotes, and a quoted expect is a number", () => {
    const text = '---\ntopic: "Plant layer"\nwhy: \'one feature\'\nexpect: "25"\n---\n';
    assert.deepEqual(parseManifest(text), {
      state: "ok",
      topic: "Plant layer",
      why: "one feature",
      expect: 25,
    });
  });
  it("CRLF line ends read like LF", () => {
    const text = "---\r\ntopic: a\r\nwhy: b\r\nexpect: 3\r\n---\r\n";
    assert.deepEqual(parseManifest(text), { state: "ok", topic: "a", why: "b", expect: 3 });
  });
});

describe("US-QG-09 LY-7 malformed manifest is named with its problems (d-136)", () => {
  const cases = [
    ["has no topic", "---\nwhy: a\nexpect: 25\n---\n", ["topic missing"]],
    ["has an empty topic", "---\ntopic:\nwhy: a\nexpect: 25\n---\n", ["topic empty"]],
    ["has an empty why", '---\ntopic: a\nwhy: ""\nexpect: 25\n---\n', ["why empty"]],
    ["has no expect", "---\ntopic: a\nwhy: b\n---\n", ["expect missing"]],
    [
      "has expect many",
      "---\ntopic: a\nwhy: b\nexpect: many\n---\n",
      ['expect "many" is not a whole number above 0'],
    ],
    [
      "has expect 0",
      "---\ntopic: a\nwhy: b\nexpect: 0\n---\n",
      ['expect "0" is not a whole number above 0'],
    ],
    [
      "has expect 2.5",
      "---\ntopic: a\nwhy: b\nexpect: 2.5\n---\n",
      ['expect "2.5" is not a whole number above 0'],
    ],
    [
      "has expect -3",
      "---\ntopic: a\nwhy: b\nexpect: -3\n---\n",
      ['expect "-3" is not a whole number above 0'],
    ],
    [
      "has expect with a unit word",
      "---\ntopic: a\nwhy: b\nexpect: 25 units\n---\n",
      ['expect "25 units" is not a whole number above 0'],
    ],
    [
      "has no known key at all",
      "---\nnote: x\n---\n",
      ["topic missing", "why missing", "expect missing"],
    ],
  ];
  for (const [label, text, problems] of cases) {
    it(`US-QG-09 LY-7: a manifest that ${label} is malformed`, () => {
      assert.deepEqual(parseManifest(text), { state: "bad", problems });
    });
  }
});

describe("US-QG-09 manifest paths (d-136)", () => {
  it("only a README.md counts, and a README.md in a folder with a dot is no manifest", () => {
    assert.equal(isManifestPath("app/x/README.md"), true);
    assert.equal(isManifestPath("README.md"), true);
    assert.equal(isManifestPath("app/x/readme.md"), false);
    assert.equal(isManifestPath("app/x/notes.md"), false);
    assert.equal(isManifestPath(".claude/x/README.md"), false);
  });
});
