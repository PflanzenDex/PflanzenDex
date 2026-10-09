// US-DEV-11: the retro script keeps exactly one pinned, locked report issue current
import test from "node:test";
import assert from "node:assert/strict";
import { main } from "./retro.mjs";
import { REPORT_TITLE } from "./retro-lib.mjs";
import { renderReport } from "./retro-render.mjs";

const ISSUES = [
  {
    number: 1,
    created_at: "2026-10-05T08:00:00Z",
    closed_at: null,
    labels: [],
    pull_request: false,
  },
  {
    number: 2,
    created_at: "2026-10-06T08:00:00Z",
    closed_at: null,
    labels: [],
    pull_request: false,
  },
];

function fakeClient({ report = null, pinFails = false } = {}) {
  const calls = [];
  return {
    calls,
    async run(cmd, args) {
      calls.push(args.join(" "));
      if (args[0] === "api") return ISSUES.map((i) => JSON.stringify(i)).join("\n") + "\n";
      if (args[0] === "issue" && args[1] === "list") return JSON.stringify(report ? [report] : []);
      if (args[0] === "issue" && args[1] === "create") return "https://github.com/o/r/issues/77\n";
      if (args[0] === "issue" && args[1] === "pin" && pinFails) throw new Error("no permission");
      return "";
    },
  };
}

const quiet = { log() {}, warn() {} };

test("US-DEV-11: without a report issue it creates, labels, locks and pins one", async () => {
  const client = fakeClient();
  assert.equal(await main(["--write"], client, quiet, "2026-10-07"), 0);
  assert.ok(client.calls.some((c) => c.startsWith("label create report")));
  assert.ok(
    client.calls.some((c) => c.startsWith(`issue create --title ${REPORT_TITLE} --label report`)),
  );
  assert.ok(client.calls.includes("issue lock 77"));
  assert.ok(client.calls.includes("issue pin 77"));
  assert.ok(!client.calls.some((c) => c.includes("milestone") || c.includes("project")));
});

test("US-DEV-11: a failed pin is a warning, not an error", async () => {
  const warnings = [];
  const client = fakeClient({ pinFails: true });
  const code = await main(
    ["--write"],
    client,
    { log() {}, warn: (m) => warnings.push(m) },
    "2026-10-07",
  );
  assert.equal(code, 0);
  assert.match(warnings.join("\n"), /pin/);
});

test("US-DEV-11: an unchanged body is not edited; a changed one is", async () => {
  const body = renderReport(ISSUES, "2026-10-07");
  const same = fakeClient({ report: { number: 9, title: REPORT_TITLE, body } });
  await main(["--write"], same, quiet, "2026-10-07");
  assert.ok(!same.calls.some((c) => c.startsWith("issue edit")));
  const stale = fakeClient({ report: { number: 9, title: REPORT_TITLE, body: "old" } });
  await main(["--write"], stale, quiet, "2026-10-07");
  assert.ok(stale.calls.some((c) => c.startsWith("issue edit 9 --body")));
});

test("US-DEV-11: without --write it only prints and changes nothing", async () => {
  const out = [];
  const client = fakeClient();
  await main([], client, { log: (m) => out.push(m), warn() {} }, "2026-10-07");
  assert.match(out.join("\n"), /xychart-beta/);
  assert.ok(client.calls.every((c) => c.startsWith("api")));
});
