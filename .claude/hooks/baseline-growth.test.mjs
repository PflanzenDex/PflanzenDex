// Tests for the baseline growth rule (US-QG-07, FR-QG-17): a baseline may shrink without a human, a change that grows
// it needs one. The hook and `make merge` both call these pure functions.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BASELINE_FORMATS,
  baselineChanges,
  baselineGrows,
  baselineProblems,
  carriedLimit,
  isBaselineFile,
  manifestEditGrowth,
  manifestGrowth,
  textAfter,
} from "./baseline-growth.mjs";

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
const ONE_P = {
  screen: "collection-view-plants-page-2",
  size: "360x640",
  page: 1,
  inner: 1.23,
};
const ONE_Q = {
  screen: "collection-view-plants-last-page",
  size: "1024x768",
  page: 1,
  inner: 1.01,
};
const ONE_R = {
  screen: "equipment-items",
  size: "390x844",
  page: 1,
  inner: 1.02,
};
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
// FR-QG-17, issue 2430: the scroll region lines outside the shared components.
const SM_A = { file: "app/packages/web/src/a.tsx", count: 2 };
const SM_B = { file: "app/packages/web/src/b.tsx", count: 1 };
// US-QG-06: the quarantine list, one entry per quarantined job of ci.yml.
const Q_A = {
  job: "lighthouse",
  since: "2026-11-09",
  issue: 1748,
  reason: "red on dev",
};
const Q_B = {
  job: "e2e",
  since: "2026-11-09",
  issue: 1749,
  reason: "red on dev",
};

// One sample per format: the base file, variants that grow it and variants that only shrink it.
const CASES = {
  "hooks-baseline.json": {
    base: {
      "packages/web/src/a.tsx": { "react-hooks/exhaustive-deps": { count: 2 } },
      "packages/web/src/b.tsx": { "react-hooks/exhaustive-deps": { count: 1 } },
    },
    grow: {
      "a new file": {
        "packages/web/src/a.tsx": { "react-hooks/exhaustive-deps": { count: 2 } },
        "packages/web/src/b.tsx": { "react-hooks/exhaustive-deps": { count: 1 } },
        "packages/web/src/c.tsx": { "react-hooks/exhaustive-deps": { count: 1 } },
      },
      "a new rule": {
        "packages/web/src/a.tsx": {
          "react-hooks/exhaustive-deps": { count: 2 },
          "react-hooks/rules-of-hooks": { count: 1 },
        },
        "packages/web/src/b.tsx": { "react-hooks/exhaustive-deps": { count: 1 } },
      },
      "a higher count": {
        "packages/web/src/a.tsx": { "react-hooks/exhaustive-deps": { count: 3 } },
        "packages/web/src/b.tsx": { "react-hooks/exhaustive-deps": { count: 1 } },
      },
    },
    shrink: {
      "a removed file": {
        "packages/web/src/a.tsx": { "react-hooks/exhaustive-deps": { count: 2 } },
      },
      "a lower count": {
        "packages/web/src/a.tsx": { "react-hooks/exhaustive-deps": { count: 1 } },
        "packages/web/src/b.tsx": { "react-hooks/exhaustive-deps": { count: 1 } },
      },
      "a removed rule": {
        "packages/web/src/a.tsx": {},
        "packages/web/src/b.tsx": { "react-hooks/exhaustive-deps": { count: 1 } },
      },
    },
  },
  "a11y-routes-baseline.json": {
    base: { maxEntries: 2, entries: [A11Y_A, A11Y_B] },
    grow: {
      "a new entry": { maxEntries: 3, entries: [A11Y_A, A11Y_B, A11Y_C] },
      "a higher count": {
        maxEntries: 2,
        entries: [{ ...A11Y_A, count: 3 }, A11Y_B],
      },
      "a raised maxEntries": { maxEntries: 3, entries: [A11Y_A, A11Y_B] },
      "a removed maxEntries": { entries: [A11Y_A, A11Y_B] },
    },
    shrink: {
      "a removed entry": { maxEntries: 1, entries: [A11Y_A] },
      "a lower count": {
        maxEntries: 2,
        entries: [{ ...A11Y_A, count: 1 }, A11Y_B],
      },
      "a lowered maxEntries": { maxEntries: 1, entries: [A11Y_A, A11Y_B] },
    },
  },
  "one-screen-baseline.json": {
    base: { maxEntries: 2, entries: [ONE_P, ONE_Q] },
    grow: {
      "a new entry": { maxEntries: 3, entries: [ONE_P, ONE_Q, ONE_R] },
      "a higher inner value": {
        maxEntries: 2,
        entries: [{ ...ONE_P, inner: 1.3 }, ONE_Q],
      },
      "a higher page value": {
        maxEntries: 2,
        entries: [{ ...ONE_P, page: 1.1 }, ONE_Q],
      },
      "a higher width cap": {
        maxEntries: 2,
        entries: [{ ...ONE_P, cap: 4 }, ONE_Q],
      },
      "a raised maxEntries": { maxEntries: 3, entries: [ONE_P, ONE_Q] },
    },
    shrink: {
      "a removed entry": { maxEntries: 1, entries: [ONE_P] },
      "a lower inner value": {
        maxEntries: 2,
        entries: [{ ...ONE_P, inner: 1.1 }, ONE_Q],
      },
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
      "a removed entry": {
        maxEntries: 1,
        entries: [{ file: "collection--light.png" }],
      },
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
      "a higher value": {
        maxEntries: 2,
        entries: [{ ...QUAL_A, value: 13 }, QUAL_B],
      },
      "a raised maxEntries": { maxEntries: 3, entries: [QUAL_A, QUAL_B] },
    },
    shrink: {
      "a removed entry": { maxEntries: 1, entries: [QUAL_A] },
      "a lower value": {
        maxEntries: 2,
        entries: [{ ...QUAL_A, value: 11 }, QUAL_B],
      },
      "a lowered maxEntries": { maxEntries: 1, entries: [QUAL_A, QUAL_B] },
    },
  },
  "quality-ds-baseline.json": {
    base: { entries: [DS_A, DS_B] },
    grow: {
      "a new entry": { entries: [DS_A, DS_B, DS_C] },
      "a higher count": { entries: [{ ...DS_A, count: 3 }, DS_B] },
      "a limit that the format does not know": {
        entries: [DS_A, DS_B],
        maxEntries: 5,
      },
    },
    shrink: {
      "a removed entry": { entries: [DS_A] },
      "a lower count": { entries: [{ ...DS_A, count: 1 }, DS_B] },
    },
  },
  "quarantine-baseline.json": {
    base: { maxEntries: 2, entries: [Q_A] },
    grow: {
      "a new entry": { maxEntries: 2, entries: [Q_A, Q_B] },
      "a raised maxEntries": { maxEntries: 3, entries: [Q_A] },
    },
    shrink: {
      "a removed entry": { maxEntries: 2, entries: [] },
      "a lowered maxEntries": { maxEntries: 1, entries: [Q_A] },
      "a changed reason of an entry (metadata)": {
        maxEntries: 2,
        entries: [{ ...Q_A, reason: "x" }],
      },
    },
  },
  "constants-baseline.json": {
    base: { maxTotal: 4, entries: [CON_A, CON_B] },
    grow: {
      "a new entry": { maxTotal: 5, entries: [CON_A, CON_B, CON_C] },
      "a higher numbers count": {
        maxTotal: 5,
        entries: [{ ...CON_A, numbers: 3 }, CON_B],
      },
      "a raised maxTotal": { maxTotal: 5, entries: [CON_A, CON_B] },
    },
    shrink: {
      "a removed entry": { maxTotal: 2, entries: [CON_A] },
      "a lower numbers count": {
        maxTotal: 3,
        entries: [{ ...CON_A, numbers: 1 }, CON_B],
      },
      "a lowered maxTotal": { maxTotal: 3, entries: [CON_A, CON_B] },
    },
  },
  "ui-text-baseline.json": {
    base: { maxTotal: 10, entries: [UI_A, UI_B] },
    grow: {
      "a new entry": { maxTotal: 11, entries: [UI_A, UI_B, UI_C] },
      "a higher count": {
        maxTotal: 11,
        entries: [{ ...UI_A, count: 7 }, UI_B],
      },
      "a raised maxTotal": { maxTotal: 11, entries: [UI_A, UI_B] },
    },
    shrink: {
      "a removed entry": { maxTotal: 6, entries: [UI_A] },
      "a lower count": { maxTotal: 9, entries: [{ ...UI_A, count: 5 }, UI_B] },
      "a lowered maxTotal": { maxTotal: 9, entries: [UI_A, UI_B] },
    },
  },
  "scroll-markers-baseline.json": {
    base: { maxTotal: 3, entries: [SM_A, SM_B] },
    grow: {
      "a new entry": {
        maxTotal: 4,
        entries: [SM_A, SM_B, { file: "app/packages/web/src/c.tsx", count: 1 }],
      },
      "a higher count": { maxTotal: 4, entries: [{ ...SM_A, count: 3 }, SM_B] },
      "a raised maxTotal": { maxTotal: 4, entries: [SM_A, SM_B] },
    },
    shrink: {
      "a removed entry": { maxTotal: 2, entries: [SM_A] },
      "a lower count": { maxTotal: 2, entries: [{ ...SM_A, count: 1 }, SM_B] },
      "a lowered maxTotal": { maxTotal: 2, entries: [SM_A, SM_B] },
    },
  },
  "reference-baseline.json": {
    base: {
      routes: ["DELETE /a", "GET /a"],
      operations: ["account.delete"],
      components: [],
    },
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
      "a removed route": {
        routes: ["GET /a"],
        operations: ["account.delete"],
        components: [],
      },
      "a missing empty list": {
        routes: ["DELETE /a", "GET /a"],
        operations: ["account.delete"],
      },
    },
  },
  "layout-baseline.json": {
    base: { "LY-1": { "app/packages/web/src/x": 2 }, "LY-3": { "app/z": 1 } },
    grow: {
      "a new directory": {
        "LY-1": { "app/packages/web/src/x": 2, "app/y": 1 },
        "LY-3": { "app/z": 1 },
      },
      "a higher value": {
        "LY-1": { "app/packages/web/src/x": 3 },
        "LY-3": { "app/z": 1 },
      },
      "a new rule": {
        "LY-1": { "app/packages/web/src/x": 2 },
        "LY-3": { "app/z": 1 },
        "LY-5": { "app/w": 1 },
      },
    },
    shrink: {
      "a lower value": {
        "LY-1": { "app/packages/web/src/x": 1 },
        "LY-3": { "app/z": 1 },
      },
      "a removed rule": { "LY-1": { "app/packages/web/src/x": 2 } },
      "a removed directory": { "LY-1": {}, "LY-3": { "app/z": 1 } },
    },
  },
};

test("US-QG-07: every baseline file has a growth format, and the formats name exactly those files", () => {
  assert.deepEqual(Object.keys(BASELINE_FORMATS).sort(), Object.keys(CASES).sort());
  assert.equal(Object.keys(BASELINE_FORMATS).length, 13);
});

test("US-QG-06: the quarantine list grows on a new entry or a raised maxEntries, and shrinks when an entry is removed", () => {
  const before = text({ maxEntries: 1, entries: [Q_A] });
  assert.equal(
    grows("quarantine-baseline.json", before, text({ maxEntries: 2, entries: [Q_A, Q_B] })).grows,
    true,
  );
  assert.deepEqual(
    grows("quarantine-baseline.json", before, text({ maxEntries: 0, entries: [] })),
    {
      grows: false,
      reasons: [],
    },
  );
  const result = grows(
    "quarantine-baseline.json",
    before,
    text({ maxEntries: 1, entries: [Q_A, Q_B] }),
  );
  assert.deepEqual(result.reasons, ["new entry e2e"], "the reason names the new job");
});

test("US-QG-07: hooks-baseline.json grows on a new file, a new rule or a raised count, and names the reason", () => {
  const before = text({
    "packages/web/src/a.tsx": { "react-hooks/exhaustive-deps": { count: 2 } },
  });
  assert.deepEqual(grows("hooks-baseline.json", null, before), {
    grows: true,
    reasons: ["a new baseline file"],
  });
  const newFile = text({
    "packages/web/src/a.tsx": { "react-hooks/exhaustive-deps": { count: 2 } },
    "packages/web/src/b.tsx": { "react-hooks/exhaustive-deps": { count: 1 } },
  });
  assert.deepEqual(grows("hooks-baseline.json", before, newFile).reasons, [
    "new entry packages/web/src/b.tsx react-hooks/exhaustive-deps",
  ]);
  const newRule = text({
    "packages/web/src/a.tsx": {
      "react-hooks/exhaustive-deps": { count: 2 },
      "react-hooks/rules-of-hooks": { count: 1 },
    },
  });
  assert.deepEqual(grows("hooks-baseline.json", before, newRule).reasons, [
    "new entry packages/web/src/a.tsx react-hooks/rules-of-hooks",
  ]);
  const raised = text({
    "packages/web/src/a.tsx": { "react-hooks/exhaustive-deps": { count: 3 } },
  });
  assert.deepEqual(grows("hooks-baseline.json", before, raised).reasons, [
    "packages/web/src/a.tsx react-hooks/exhaustive-deps: count rose from 2 to 3",
  ]);
});

test("US-QG-07: hooks-baseline.json shrinks on a lower count, a removed rule or a removed file", () => {
  const before = text({
    "packages/web/src/a.tsx": { "react-hooks/exhaustive-deps": { count: 2 } },
    "packages/web/src/b.tsx": { "react-hooks/exhaustive-deps": { count: 1 } },
  });
  const lowerCount = {
    "packages/web/src/a.tsx": { "react-hooks/exhaustive-deps": { count: 1 } },
    "packages/web/src/b.tsx": { "react-hooks/exhaustive-deps": { count: 1 } },
  };
  const removedRule = {
    "packages/web/src/a.tsx": {},
    "packages/web/src/b.tsx": { "react-hooks/exhaustive-deps": { count: 1 } },
  };
  const removedFile = { "packages/web/src/b.tsx": { "react-hooks/exhaustive-deps": { count: 1 } } };
  for (const after of [lowerCount, removedRule, removedFile])
    assert.deepEqual(grows("hooks-baseline.json", before, text(after)), {
      grows: false,
      reasons: [],
    });
});

test("US-QG-07: hooks-baseline.json: a new entry counts as growth even when another entry shrinks", () => {
  const before = text({
    "packages/web/src/a.tsx": { "react-hooks/exhaustive-deps": { count: 2 } },
  });
  const after = text({ "packages/web/src/c.tsx": { "react-hooks/exhaustive-deps": { count: 1 } } });
  assert.deepEqual(grows("hooks-baseline.json", before, after).reasons, [
    "new entry packages/web/src/c.tsx react-hooks/exhaustive-deps",
  ]);
});

test("US-QG-07: hooks-baseline.json: malformed text counts as growth (a count that is no number, an unknown field, a rule or a file that is no object, a top-level array)", () => {
  const before = text({
    "packages/web/src/a.tsx": { "react-hooks/exhaustive-deps": { count: 2 } },
  });
  const malformed = {
    "a count that is no number": {
      "packages/web/src/a.tsx": { "react-hooks/exhaustive-deps": { count: -1 } },
    },
    "an unknown field": {
      "packages/web/src/a.tsx": { "react-hooks/exhaustive-deps": { count: 2, note: "x" } },
    },
    "a rule that is no object": { "packages/web/src/a.tsx": { "react-hooks/exhaustive-deps": 2 } },
    "a file that is no object of rules": { "packages/web/src/a.tsx": 3 },
    "a top-level array": [],
  };
  for (const [label, value] of Object.entries(malformed)) {
    const result = grows("hooks-baseline.json", before, text(value));
    assert.equal(result.grows, true, label);
    assert.match(result.reasons[0], /^the new text does not parse: /, label);
  }
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
  const withPageX = (value) => ({
    maxEntries: 1,
    entries: [{ ...ONE_P, pageX: value }],
  });
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
  const withNumbers = {
    maxTotal: 2,
    entries: [{ file: "a.ts", enums: 1, numbers: 1 }],
  };
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

test("US-QG-07: one-screen rules per entry may only shrink; issue and reason are metadata; an unknown field refuses by name", () => {
  const one = (extra) => text({ maxEntries: 2, entries: [{ ...ONE_P, ...extra }, ONE_Q] });
  const name = "one-screen-baseline.json";
  const two = one({ rules: ["pager", "title"] });
  assert.equal(grows(name, two, one({ rules: ["pager"] })).grows, false, "a lost rule");
  assert.equal(grows(name, two, one({})).grows, false, "all rules lost");
  assert.equal(grows(name, two, two).grows, false, "unchanged");
  assert.match(grows(name, one({ rules: ["pager"] }), two).reasons.join(), /new rules entry title/);
  assert.equal(grows(name, one({}), one({ rules: ["pager"] })).grows, true, "a first rule");
  assert.equal(
    grows(
      name,
      one({ rules: ["pager"], issue: 1 }),
      one({ rules: ["pager"], issue: 2, reason: "x" }),
    ).grows,
    false,
    "issue and reason are metadata",
  );
  assert.match(grows(name, one({}), one({ bogus: 1 })).reasons.join(), /field bogus/);
  assert.equal(grows(name, one({}), one({ rules: [1] })).grows, true, "rules must be texts");
});

// US-QG-09 (d-136, LY-1c): a layout manifest (the frontmatter of a README.md) is judged like baseline growth, by make merge.
const manifestText = (expect, topic = "Plant layer") =>
  `---\ntopic: ${topic}\nwhy: one feature\nexpect: ${expect}\n---\n# Plant layer\n`;
const READ_ME = "app/x/README.md";
// The files of a pull request: `files` are the changed paths; `texts` maps "<base|head>:<path>" to the text on that side.
function manifestChanges(files, texts) {
  return baselineChanges(
    { headRefOid: "head", files: files.map((path) => ({ path })) },
    {
      mergeBase: () => "base",
      readAt: (sha, path) => {
        const key = `${sha === "head" ? "head" : "base"}:${path}`;
        if (texts[key] === "THROW") throw new Error("HTTP 500");
        return texts[key] ?? null;
      },
      namedAtHead: () => true,
    },
  );
}
const problemsOf = (files, texts) => baselineProblems(manifestChanges(files, texts));

test("US-QG-09 (d-136): a new manifest is growth, and its expect is named", () => {
  const result = manifestGrowth(null, manifestText(25));
  assert.equal(result.grows, true);
  assert.deepEqual(result.reasons, ["a new manifest, expect 25"]);
});

test("US-QG-09 (d-136): a raised expect is growth, a lowered or an equal one is not", () => {
  assert.deepEqual(manifestGrowth(manifestText(25), manifestText(26)), {
    grows: true,
    reasons: ["expect rose from 25 to 26"],
  });
  assert.deepEqual(manifestGrowth(manifestText(25), manifestText(24)), {
    grows: false,
    reasons: [],
  });
  assert.deepEqual(manifestGrowth(manifestText(25), manifestText(25, "Plants")), {
    grows: false,
    reasons: [],
  });
});

test("US-QG-09 (d-136): a removed manifest passes, and a README without frontmatter is no manifest", () => {
  assert.deepEqual(manifestGrowth(manifestText(25), null), { grows: false, reasons: [] });
  assert.deepEqual(manifestGrowth(manifestText(25), "# Plant layer\n"), {
    grows: false,
    reasons: [],
  });
  assert.deepEqual(manifestGrowth(null, "# Plant layer\n"), { grows: false, reasons: [] });
});

test("US-QG-09 (d-136): a manifest that does not parse is growth (fail closed)", () => {
  const result = manifestGrowth(manifestText(25), manifestText("many"));
  assert.equal(result.grows, true);
  assert.match(result.reasons[0], /^the layout manifest does not parse: expect "many"/);
});

test("US-QG-09 (d-136): a pull request that adds a manifest is reported as baseline growth", () => {
  const problems = problemsOf([READ_ME], { [`head:${READ_ME}`]: manifestText(25) });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^baseline grows: app\/x\/README\.md \(.*a new manifest, expect 25/);
});

test("US-QG-09 (d-136): a pull request that raises an expect is reported; one that lowers it or removes the manifest is not", () => {
  const base = { [`base:${READ_ME}`]: manifestText(25) };
  assert.equal(problemsOf([READ_ME], { ...base, [`head:${READ_ME}`]: manifestText(26) }).length, 1);
  assert.deepEqual(problemsOf([READ_ME], { ...base, [`head:${READ_ME}`]: manifestText(24) }), []);
  assert.deepEqual(problemsOf([READ_ME], base), [], "removed: no head text");
});

test("US-QG-09 (d-136): a README without a manifest, and a README in a folder with a dot, are not judged", () => {
  assert.deepEqual(problemsOf([READ_ME], { [`head:${READ_ME}`]: "# Plant layer\n" }), []);
  assert.deepEqual(
    problemsOf([".claude/x/README.md"], { "head:.claude/x/README.md": manifestText(25) }),
    [],
  );
});

test("US-QG-09 (d-136): a manifest version that cannot be read refuses the pull request (fail closed)", () => {
  const changes = manifestChanges([READ_ME], { [`head:${READ_ME}`]: "THROW" });
  assert.equal(changes.length, 1);
  assert.match(changes[0].error, /HTTP 500/);
  assert.match(baselineProblems(changes)[0], /a version cannot be read/);
});

// US-QG-09 (d-139): the fixed per-path limits of the merge base move into manifests. The limit a folder had there carries
// over, and the README unit that a new manifest adds counts on top of it: such a manifest is no growth.
const LAYOUT = "app/config/lint/layout.config.mjs";
const CONFIG = `// the layout config
export default {
  maxUnits: 8,
  dirs: [
    { path: "app/x", maxUnits: 6 },
    { path: "app/packages/*/src/*", maxUnits: 10 },
    { path: "app/p/src", maxUnits: Infinity },
  ],
};
`;

test("US-QG-09 (d-139): carriedLimit is the per-path limit of the merge base, plus the README unit when the README is new", () => {
  assert.equal(carriedLimit(CONFIG, "app/x", null), 7);
  assert.equal(carriedLimit(CONFIG, "app/x", "# x\n"), 6);
  assert.equal(carriedLimit(CONFIG, "app/packages/web/src/wishlist", null), 11);
});

test("US-QG-09 (d-139): carriedLimit carries nothing for a folder without a finite per-path rule, or without a config that runs", () => {
  assert.equal(carriedLimit(CONFIG, "app/y", null), undefined, "no rule");
  assert.equal(carriedLimit(CONFIG, "app/p/src", null), undefined, "no limit (Infinity)");
  assert.equal(carriedLimit(null, "app/x", null), undefined, "no config at the merge base");
  assert.equal(carriedLimit("export default {", "app/x", null), undefined, "does not run");
  assert.equal(carriedLimit("const x = 1;", "app/x", null), undefined, "no default export");
});

test("US-QG-09 (d-139): a new manifest within the carried limit is no growth, one above it is", () => {
  assert.deepEqual(manifestGrowth(null, manifestText(7), 7), { grows: false, reasons: [] });
  assert.deepEqual(manifestGrowth(null, manifestText(8), 7), {
    grows: true,
    reasons: ["a new manifest, expect 8"],
  });
  assert.deepEqual(
    manifestGrowth(null, manifestText(25)),
    {
      grows: true,
      reasons: ["a new manifest, expect 25"],
    },
    "no carried limit: growth, as before",
  );
});

test("US-QG-09 (d-139): a pull request that moves a per-path limit into a manifest is no growth, one above it is", () => {
  const base = { [`base:${LAYOUT}`]: CONFIG };
  assert.deepEqual(problemsOf([READ_ME], { ...base, [`head:${READ_ME}`]: manifestText(7) }), []);
  const over = problemsOf([READ_ME], { ...base, [`head:${READ_ME}`]: manifestText(8) });
  assert.equal(over.length, 1);
  assert.match(over[0], /^baseline grows: app\/x\/README\.md \(a new manifest, expect 8\)/);
});

test("US-QG-09 (d-139): a new manifest in a folder without a per-path rule, or with no config at the merge base, is growth", () => {
  const base = { [`base:${LAYOUT}`]: CONFIG };
  assert.equal(
    problemsOf(["app/y/README.md"], { ...base, "head:app/y/README.md": manifestText(7) }).length,
    1,
  );
  assert.equal(problemsOf([READ_ME], { [`head:${READ_ME}`]: manifestText(7) }).length, 1);
});

test("US-QG-09 (d-139): a config at the merge base that cannot be read refuses the manifest (fail closed)", () => {
  const changes = manifestChanges([READ_ME], {
    [`head:${READ_ME}`]: manifestText(7),
    [`base:${LAYOUT}`]: "THROW",
  });
  assert.equal(changes.length, 1);
  assert.match(changes[0].error, /HTTP 500/);
});

test("US-QG-09 (d-139): a manifest edit is judged against the merge base, a README made on this branch counts its unit as new", () => {
  const base = { config: CONFIG, readme: null };
  assert.equal(manifestEditGrowth(READ_ME, null, { content: manifestText(7) }, base), null);
  assert.equal(
    manifestEditGrowth(READ_ME, null, { content: manifestText(8) }, base),
    "a new manifest, expect 8",
  );
  // On disk the README exists without frontmatter, but it is new at the merge base: its unit is still the new one.
  assert.equal(manifestEditGrowth(READ_ME, "# x\n", { content: manifestText(7) }, base), null);
  // A README that already exists at the merge base has its unit counted: 7 is above the carried 6.
  assert.equal(
    manifestEditGrowth(
      READ_ME,
      "# x\n",
      { content: manifestText(7) },
      { config: CONFIG, readme: "# x\n" },
    ),
    "a new manifest, expect 7",
  );
});

test("US-QG-09 (d-139): a raised expect of a manifest on disk is growth, a lowered one and an edit of the body are not", () => {
  const on = manifestText(11);
  const base = { config: CONFIG, readme: null };
  assert.equal(
    manifestEditGrowth(READ_ME, on, { old_string: "expect: 11", new_string: "expect: 12" }, base),
    "expect rose from 11 to 12",
  );
  assert.equal(
    manifestEditGrowth(READ_ME, on, { old_string: "expect: 11", new_string: "expect: 10" }, base),
    null,
  );
  assert.equal(
    manifestEditGrowth(READ_ME, on, { old_string: "# Plant layer", new_string: "# Plants" }, base),
    null,
  );
});

test("US-QG-09 (d-139): a manifest edit that cannot be placed exactly on the file is growth (fail closed)", () => {
  assert.equal(
    manifestEditGrowth(
      READ_ME,
      manifestText(11),
      { old_string: "nowhere", new_string: "x" },
      {
        config: CONFIG,
        readme: null,
      },
    ),
    "the edit cannot be placed exactly on the file",
  );
});
