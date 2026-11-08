// Tests for the baseline growth rule (US-QG-07, FR-QG-17): a baseline may shrink without a human, a change that grows
// it needs one. The hook and `make merge` both call these pure functions.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BASELINE_FORMATS, baselineGrows, isBaselineFile, textAfter } from "./baseline-growth.mjs";

const at = (name) => `app/config/gates/baselines/${name}`;
const text = (value) => JSON.stringify(value, null, 2);
const grows = (name, before, after, options) => baselineGrows(at(name), before, after, options);

const A11Y_A = {
  screen: "collection-view-wishlist",
  size: "390x844",
  kind: "axe",
  rule: "label-content-name-mismatch",
  count: 2,
};
const A11Y_B = {
  screen: "welcome-keycloak-anmelden",
  size: "390x844",
  kind: "keyboard",
  rule: "focus-visible",
  count: 2,
};
const A11Y_C = {
  screen: "wishlist-wish-layer",
  size: "1920x1080",
  kind: "axe",
  rule: "label-content-name-mismatch",
  count: 2,
};
const ONE_P = { screen: "collection-view-plants-page-2", size: "360x640", page: 1, inner: 1.23 };
const ONE_Q = {
  screen: "collection-view-plants-last-page",
  size: "1024x768",
  page: 1,
  inner: 1.01,
};
const ONE_R = { screen: "equipment-items", size: "390x844", page: 1, inner: 1.02 };
const QUAL_A = {
  rule: "complexity",
  file: "app/packages/core/src/a.ts",
  function: "parse",
  value: 12,
  date: "2026-11-01",
};
const QUAL_B = {
  rule: "max-depth",
  file: "app/packages/web/src/b.tsx",
  function: "render",
  value: 4,
  date: "2026-11-02",
};
const QUAL_C = {
  rule: "max-params",
  file: "app/tools/check/c.mjs",
  function: "check",
  value: 5,
  date: "2026-11-06",
};
const DS_A = { rule: "DS-12", file: "app/packages/web/src/a.tsx", count: 2 };
const DS_B = { rule: "DS-40", file: "app/packages/web/src/b.tsx", count: 1 };
const DS_C = { rule: "DS-12", file: "app/packages/web/src/c.tsx", count: 1 };
const CON_A = { file: "app/packages/api/src/a.ts", numbers: 2 };
const CON_B = { file: "app/packages/core/src/b.ts", numbers: 1, enums: 1 };
const CON_C = { file: "app/packages/web/src/c.ts", enums: 1 };
const UI_A = { file: "app/packages/web/src/a.tsx", count: 6 };
const UI_B = { file: "app/packages/web/src/b.tsx", count: 4 };
const UI_C = { file: "app/packages/web/src/c.tsx", count: 1 };

// One sample per format: the base file, variants that grow it and variants that only shrink it.
const CASES = {
  "a11y-routes-baseline.json": {
    base: { maxEntries: 2, entries: [A11Y_A, A11Y_B] },
    grow: {
      "a new entry": { maxEntries: 3, entries: [A11Y_A, A11Y_B, A11Y_C] },
      "a higher count": { maxEntries: 2, entries: [{ ...A11Y_A, count: 3 }, A11Y_B] },
      "a raised maxEntries": { maxEntries: 3, entries: [A11Y_A, A11Y_B] },
      "a removed maxEntries": { entries: [A11Y_A, A11Y_B] },
    },
    shrink: {
      "a removed entry": { maxEntries: 1, entries: [A11Y_A] },
      "a lower count": { maxEntries: 2, entries: [{ ...A11Y_A, count: 1 }, A11Y_B] },
      "a lowered maxEntries": { maxEntries: 1, entries: [A11Y_A, A11Y_B] },
    },
  },
  "one-screen-baseline.json": {
    base: { maxEntries: 2, entries: [ONE_P, ONE_Q] },
    grow: {
      "a new entry": { maxEntries: 3, entries: [ONE_P, ONE_Q, ONE_R] },
      "a higher inner value": { maxEntries: 2, entries: [{ ...ONE_P, inner: 1.3 }, ONE_Q] },
      "a higher page value": { maxEntries: 2, entries: [{ ...ONE_P, page: 1.1 }, ONE_Q] },
      "a higher width cap": { maxEntries: 2, entries: [{ ...ONE_P, cap: 4 }, ONE_Q] },
      "a raised maxEntries": { maxEntries: 3, entries: [ONE_P, ONE_Q] },
    },
    shrink: {
      "a removed entry": { maxEntries: 1, entries: [ONE_P] },
      "a lower inner value": { maxEntries: 2, entries: [{ ...ONE_P, inner: 1.1 }, ONE_Q] },
      "a lowered maxEntries": { maxEntries: 1, entries: [ONE_P, ONE_Q] },
    },
  },
  "layout-shift-baseline.json": {
    base: {
      maxEntries: 2,
      entries: [
        { screen: "today", size: "360x640", cls: 0.12 },
        { screen: "discover", size: "1280x800", cls: 0.2 },
      ],
    },
    grow: {
      "a new entry": {
        maxEntries: 3,
        entries: [
          { screen: "today", size: "360x640", cls: 0.12 },
          { screen: "discover", size: "1280x800", cls: 0.2 },
          { screen: "welcome", size: "390x844", cls: 0.11 },
        ],
      },
      "a higher cls": {
        maxEntries: 2,
        entries: [
          { screen: "today", size: "360x640", cls: 0.13 },
          { screen: "discover", size: "1280x800", cls: 0.2 },
        ],
      },
      "a raised maxEntries": {
        maxEntries: 3,
        entries: [
          { screen: "today", size: "360x640", cls: 0.12 },
          { screen: "discover", size: "1280x800", cls: 0.2 },
        ],
      },
    },
    shrink: {
      "a removed entry": {
        maxEntries: 1,
        entries: [{ screen: "today", size: "360x640", cls: 0.12 }],
      },
      "a lower cls": {
        maxEntries: 2,
        entries: [
          { screen: "today", size: "360x640", cls: 0.11 },
          { screen: "discover", size: "1280x800", cls: 0.2 },
        ],
      },
      "a lowered maxEntries": {
        maxEntries: 1,
        entries: [
          { screen: "today", size: "360x640", cls: 0.12 },
          { screen: "discover", size: "1280x800", cls: 0.2 },
        ],
      },
    },
  },
  "page-snapshots-baseline.json": {
    base: {
      maxEntries: 2,
      entries: [{ file: "collection--light.png" }, { file: "plants--dark.png" }],
    },
    grow: {
      "a new entry": {
        maxEntries: 3,
        entries: [
          { file: "collection--light.png" },
          { file: "plants--dark.png" },
          { file: "wishlist--light.png" },
        ],
      },
      "a raised maxEntries": {
        maxEntries: 3,
        entries: [{ file: "collection--light.png" }, { file: "plants--dark.png" }],
      },
    },
    shrink: {
      "a removed entry": { maxEntries: 1, entries: [{ file: "collection--light.png" }] },
      "a lowered maxEntries": {
        maxEntries: 1,
        entries: [{ file: "collection--light.png" }, { file: "plants--dark.png" }],
      },
    },
  },
  "quality-baseline.json": {
    base: { maxEntries: 2, entries: [QUAL_A, QUAL_B] },
    grow: {
      "a new entry": { maxEntries: 3, entries: [QUAL_A, QUAL_B, QUAL_C] },
      "a higher value": { maxEntries: 2, entries: [{ ...QUAL_A, value: 13 }, QUAL_B] },
      "a raised maxEntries": { maxEntries: 3, entries: [QUAL_A, QUAL_B] },
    },
    shrink: {
      "a removed entry": { maxEntries: 1, entries: [QUAL_A] },
      "a lower value": { maxEntries: 2, entries: [{ ...QUAL_A, value: 11 }, QUAL_B] },
      "a lowered maxEntries": { maxEntries: 1, entries: [QUAL_A, QUAL_B] },
    },
  },
  "quality-ds-baseline.json": {
    base: { entries: [DS_A, DS_B] },
    grow: {
      "a new entry": { entries: [DS_A, DS_B, DS_C] },
      "a higher count": { entries: [{ ...DS_A, count: 3 }, DS_B] },
      "a limit that the format does not know": { entries: [DS_A, DS_B], maxEntries: 5 },
    },
    shrink: {
      "a removed entry": { entries: [DS_A] },
      "a lower count": { entries: [{ ...DS_A, count: 1 }, DS_B] },
    },
  },
  "constants-baseline.json": {
    base: { maxTotal: 4, entries: [CON_A, CON_B] },
    grow: {
      "a new entry": { maxTotal: 5, entries: [CON_A, CON_B, CON_C] },
      "a higher numbers count": { maxTotal: 5, entries: [{ ...CON_A, numbers: 3 }, CON_B] },
      "a raised maxTotal": { maxTotal: 5, entries: [CON_A, CON_B] },
    },
    shrink: {
      "a removed entry": { maxTotal: 2, entries: [CON_A] },
      "a lower numbers count": { maxTotal: 3, entries: [{ ...CON_A, numbers: 1 }, CON_B] },
      "a lowered maxTotal": { maxTotal: 3, entries: [CON_A, CON_B] },
    },
  },
  "ui-text-baseline.json": {
    base: { maxTotal: 10, entries: [UI_A, UI_B] },
    grow: {
      "a new entry": { maxTotal: 11, entries: [UI_A, UI_B, UI_C] },
      "a higher count": { maxTotal: 11, entries: [{ ...UI_A, count: 7 }, UI_B] },
      "a raised maxTotal": { maxTotal: 11, entries: [UI_A, UI_B] },
    },
    shrink: {
      "a removed entry": { maxTotal: 6, entries: [UI_A] },
      "a lower count": { maxTotal: 9, entries: [{ ...UI_A, count: 5 }, UI_B] },
      "a lowered maxTotal": { maxTotal: 9, entries: [UI_A, UI_B] },
    },
  },
  "reference-baseline.json": {
    base: { routes: ["DELETE /a", "GET /a"], operations: ["account.delete"], components: [] },
    grow: {
      "a new route": {
        routes: ["DELETE /a", "GET /a", "GET /b"],
        operations: ["account.delete"],
        components: [],
      },
      "a new operation": {
        routes: ["DELETE /a", "GET /a"],
        operations: ["account.delete", "x.y"],
        components: [],
      },
      "an item moved to another list": {
        routes: ["DELETE /a"],
        operations: ["account.delete", "GET /a"],
        components: [],
      },
      "a list the format does not know": {
        routes: ["DELETE /a", "GET /a"],
        operations: ["account.delete"],
        components: [],
        extras: [],
      },
    },
    shrink: {
      "a removed route": { routes: ["GET /a"], operations: ["account.delete"], components: [] },
      "a missing empty list": { routes: ["DELETE /a", "GET /a"], operations: ["account.delete"] },
    },
  },
  "layout-baseline.json": {
    base: { "LY-1": { "app/packages/web/src/x": 2 }, "LY-3": { "app/z": 1 } },
    grow: {
      "a new directory": {
        "LY-1": { "app/packages/web/src/x": 2, "app/y": 1 },
        "LY-3": { "app/z": 1 },
      },
      "a higher value": { "LY-1": { "app/packages/web/src/x": 3 }, "LY-3": { "app/z": 1 } },
      "a new rule": {
        "LY-1": { "app/packages/web/src/x": 2 },
        "LY-3": { "app/z": 1 },
        "LY-5": { "app/w": 1 },
      },
    },
    shrink: {
      "a lower value": { "LY-1": { "app/packages/web/src/x": 1 }, "LY-3": { "app/z": 1 } },
      "a removed rule": { "LY-1": { "app/packages/web/src/x": 2 } },
      "a removed directory": { "LY-1": {}, "LY-3": { "app/z": 1 } },
    },
  },
};

test("US-QG-07: the ten baseline files each have a growth format, and the formats name exactly those files", () => {
  assert.deepEqual(Object.keys(BASELINE_FORMATS).sort(), Object.keys(CASES).sort());
  assert.equal(Object.keys(BASELINE_FORMATS).length, 10);
});

test("US-QG-07: isBaselineFile covers the whole baseline folder and nothing else", () => {
  assert.equal(isBaselineFile(at("ui-text-baseline.json")), true);
  assert.equal(isBaselineFile(at("new-thing.txt")), true);
  assert.equal(isBaselineFile("app/config/gates/quality-limits.json"), false);
  assert.equal(isBaselineFile("app/config/gates/baselinesX/x.json"), false);
});

for (const [name, sample] of Object.entries(CASES)) {
  test(`US-QG-07: ${name} grows on a new entry, a worse value or a raised limit, and shrinks on the opposite`, () => {
    const before = text(sample.base);
    assert.deepEqual(
      grows(name, before, before),
      { grows: false, reasons: [] },
      "identical text is no growth",
    );
    for (const [label, value] of Object.entries(sample.grow)) {
      const result = grows(name, before, text(value));
      assert.equal(result.grows, true, `${name}: ${label} must grow`);
      assert.ok(result.reasons.length > 0, `${name}: ${label} names a reason`);
    }
    for (const [label, value] of Object.entries(sample.shrink)) {
      assert.deepEqual(
        grows(name, before, text(value)),
        { grows: false, reasons: [] },
        `${name}: ${label} must shrink`,
      );
    }
  });

  test(`US-QG-07: ${name} unparsable text, text of the wrong shape and a text not in JSON count as growth`, () => {
    const before = text(sample.base);
    assert.equal(grows(name, before, "{ not json").grows, true, "after is not JSON");
    assert.equal(grows(name, "{ not json", before).grows, true, "before is not JSON");
    assert.equal(grows(name, before, "[]").grows, true, "after is an array");
    assert.equal(grows(name, before, "").grows, true, "after is empty");
  });
}

test("US-QG-07: a raised maxEntries grows and a lowered one shrinks, even with the same entries (one-screen)", () => {
  const entries = [ONE_P, ONE_Q];
  assert.match(
    grows(
      "one-screen-baseline.json",
      text({ maxEntries: 2, entries }),
      text({ maxEntries: 3, entries }),
    ).reasons.join(),
    /maxEntries raised from 2 to 3/,
  );
  assert.equal(
    grows(
      "one-screen-baseline.json",
      text({ maxEntries: 2, entries }),
      text({ maxEntries: 1, entries }),
    ).grows,
    false,
  );
});

test("US-QG-07: a format this module does not know counts as growth, also a name like an object prototype key", () => {
  assert.equal(grows("new-thing-baseline.json", "{}", "{}").grows, true);
  assert.equal(grows("constructor", "{}", "{}").grows, true);
  assert.equal(grows("toString", "{}", "{}").grows, true);
});

test("US-QG-07: a new baseline file counts as growth, whatever its text", () => {
  const result = grows("ui-text-baseline.json", null, text({ maxTotal: 0, entries: [] }));
  assert.equal(result.grows, true);
  assert.match(result.reasons.join(), /new baseline file/);
});

test("US-QG-07: a deleted baseline counts as shrinking only when its gate no longer names it, otherwise as growth", () => {
  const before = text(CASES["ui-text-baseline.json"].base);
  assert.equal(
    grows("ui-text-baseline.json", before, null).grows,
    true,
    "unclear counts as growth by default",
  );
  assert.equal(grows("ui-text-baseline.json", before, null, { gateNamesFile: true }).grows, true);
  assert.deepEqual(grows("ui-text-baseline.json", before, null, { gateNamesFile: false }), {
    grows: false,
    reasons: [],
  });
});

test("US-QG-07: the reason names the entry, the value and the old and new number", () => {
  const result = grows(
    "ui-text-baseline.json",
    text(CASES["ui-text-baseline.json"].base),
    text({ maxTotal: 10, entries: [{ ...UI_A, count: 7 }, UI_B] }),
  );
  assert.equal(result.grows, true);
  assert.deepEqual(result.reasons, ["app/packages/web/src/a.tsx: count rose from 6 to 7"]);
});

test("US-QG-07: a missing optional number counts as its default, as the checkers read it", () => {
  // one-screen: a missing pageX is 1, and so is an explicit 1; 1.5 is worse than the default.
  const withoutPageX = { maxEntries: 1, entries: [ONE_P] };
  const withPageX = (value) => ({ maxEntries: 1, entries: [{ ...ONE_P, pageX: value }] });
  assert.equal(
    grows("one-screen-baseline.json", text(withoutPageX), text(withPageX(1))).grows,
    false,
  );
  assert.equal(
    grows("one-screen-baseline.json", text(withoutPageX), text(withPageX(1.5))).grows,
    true,
  );
  assert.equal(
    grows("one-screen-baseline.json", text(withPageX(1.5)), text(withoutPageX)).grows,
    false,
  );
  // constants: a missing count is 0.
  const withoutNumbers = { maxTotal: 1, entries: [{ file: "a.ts", enums: 1 }] };
  const withNumbers = { maxTotal: 2, entries: [{ file: "a.ts", enums: 1, numbers: 1 }] };
  assert.equal(
    grows("constants-baseline.json", text(withoutNumbers), text(withNumbers)).grows,
    true,
  );
  assert.equal(
    grows("constants-baseline.json", text(withNumbers), text(withoutNumbers)).grows,
    false,
  );
});

test("US-QG-07: a duplicate entry counts as growth, a change of the date alone does not", () => {
  const dupe = { maxTotal: 10, entries: [UI_A, { ...UI_A, count: 1 }] };
  assert.equal(
    grows("ui-text-baseline.json", text(CASES["ui-text-baseline.json"].base), text(dupe)).grows,
    true,
  );
  const base = { maxEntries: 1, entries: [QUAL_A] };
  assert.equal(
    grows(
      "quality-baseline.json",
      text(base),
      text({ maxEntries: 1, entries: [{ ...QUAL_A, date: "2026-11-06" }] }),
    ).grows,
    false,
  );
});

test("US-QG-07: an unknown field of an entry counts as growth, fail closed", () => {
  const base = { maxTotal: 10, entries: [UI_A] };
  assert.equal(
    grows(
      "ui-text-baseline.json",
      text(base),
      text({ maxTotal: 10, entries: [{ ...UI_A, note: "x" }] }),
    ).grows,
    true,
  );
});

test("US-QG-07: textAfter applies a Write, an Edit and a MultiEdit exactly like the tool, or gives up", () => {
  assert.equal(textAfter({ content: "new" }, "old"), "new");
  assert.equal(textAfter({ content: "new" }, null), "new");
  assert.equal(textAfter({ old_string: "a", new_string: "b" }, "xay"), "xby");
  assert.equal(
    textAfter({ old_string: "a", new_string: "$&$&" }, "xay"),
    "x$&$&y",
    "the replacement is literal",
  );
  assert.equal(
    textAfter({ old_string: "a", new_string: "b" }, "xayaz"),
    null,
    "ambiguous without replace_all",
  );
  assert.equal(
    textAfter({ old_string: "a", new_string: "b", replace_all: true }, "xayaz"),
    "xbybz",
  );
  assert.equal(textAfter({ old_string: "q", new_string: "b" }, "xay"), null, "not found");
  assert.equal(textAfter({ old_string: "", new_string: "b" }, "xay"), null, "an empty old string");
  assert.equal(
    textAfter({ old_string: "a", new_string: "b" }, null),
    null,
    "an edit of a missing file",
  );
  assert.equal(textAfter({}, "xay"), null, "neither content nor an edit");
  assert.equal(
    textAfter(
      {
        edits: [
          { old_string: "a", new_string: "b" },
          { old_string: "b", new_string: "c" },
        ],
      },
      "a",
    ),
    "c",
    "MultiEdit applies its edits in order",
  );
  assert.equal(
    textAfter(
      {
        edits: [
          { old_string: "a", new_string: "b" },
          { old_string: "q", new_string: "c" },
        ],
      },
      "a",
    ),
    null,
    "MultiEdit gives up when one edit does not apply",
  );
});
